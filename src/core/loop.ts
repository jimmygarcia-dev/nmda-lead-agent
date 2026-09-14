import type { ChatMessage, ChatResult } from '../llm/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { ApprovalGate } from '../approval/types.js';
import type { Guardrails } from '../guardrails/guardrails.js';
import type { AgentObserver } from '../observability/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { JsonSchema } from '../types/jsonSchema.js';
import type { AgentAction, AgentStep } from './types.js';
import { ensureObject, safeJsonParse } from '../util/json.js';

export interface LoopInput {
  provider: LLMProvider;
  registry: ToolRegistry;
  systemPrompt: string;
  userInput: string;
  maxTurns: number;
  onStep?: (step: AgentStep) => void;
  observer?: AgentObserver;
  guards?: Guardrails;
  approval?: ApprovalGate;
  /** Streaming en vivo de tokens (si el provider lo soporta). */
  stream?: boolean;
  onToken?: (delta: string) => void;
}

export interface LoopResult {
  answer: string;
  turns: number;
  steps: AgentStep[];
}

const toolNamesCache = new WeakMap<object, string[]>();

function buildDecisionSchema(toolNames: string[]): JsonSchema {
  const toolProp: JsonSchema = {
    type: 'string',
    description: 'Nombre del tool a invocar. Solo cuando kind=tool.',
  };
  if (toolNames.length > 0) {
    toolProp.enum = toolNames;
  }
  return {
    type: 'object',
    properties: {
      thought: {
        type: 'string',
        description: 'Razonamiento interno breve: qué hacés y por qué, en español.',
      },
      action: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['tool', 'final'] },
          tool: toolProp,
          args: {
            type: 'object',
            description: 'Argumentos JSON del tool a invocar. Solo cuando kind=tool.',
          },
          answer: {
            type: 'string',
            description: 'Respuesta final para el usuario. Solo cuando kind=final.',
          },
        },
        required: ['kind'],
      },
    },
    required: ['thought', 'action'],
  };
}

function parseDecision(content: string): { ok: true; action: AgentAction; thought: string } | { ok: false; reason: string } {
  const raw = safeJsonParse(content);
  if (raw === undefined) {
    return { ok: false, reason: 'La respuesta no era JSON válido.' };
  }
  const obj = ensureObject(raw);
  const action = ensureObject(obj.action);
  const kind = action.kind;
  const thought = typeof obj.thought === 'string' ? obj.thought : '';

  if (kind === 'final') {
    const answer = typeof action.answer === 'string' ? action.answer.trim() : '';
    if (!answer) return { ok: false, reason: 'kind=final pero answer estaba vacío.' };
    return { ok: true, thought, action: { kind: 'final', answer } };
  }

  if (kind === 'tool') {
    const tool = typeof action.tool === 'string' ? action.tool.trim() : '';
    const args = ensureObject(action.args);
    if (!tool) return { ok: false, reason: 'kind=tool pero tool estaba vacío.' };
    return { ok: true, thought, action: { kind: 'tool', tool, args } };
  }

  return { ok: false, reason: `kind inválido: ${JSON.stringify(kind)}` };
}

export async function runLoop(input: LoopInput): Promise<LoopResult> {
  const schema = buildDecisionSchema(toolNamesOf(input.registry));
  const messages: ChatMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userInput },
  ];

  const steps: AgentStep[] = [];
  let budgetHitReason: string | undefined;
  const record = (step: AgentStep) => {
    input.onStep?.(step);
  };

  for (let turn = 1; turn <= input.maxTurns; turn++) {
    if (input.guards) {
      const budget = input.guards.budgetMet();
      if (!budget.allowed) {
        budgetHitReason = budget.reason;
        break;
      }
    }

    let res: ChatResult;
    try {
      res = await callDecision(input, messages, schema, turn);
    } catch (err) {
      // El modelo falló o tardó demasiado (timeout): no morimos con ERROR,
      // cortamos y concluimos con lo que ya se observó.
      const message = err instanceof Error ? err.message : String(err);
      budgetHitReason = `el modelo falló o tardó demasiado: ${message}`;
      break;
    }
    input.guards?.afterLlmCall(res.usage);

    const decision = parseDecision(res.content);
    if (!decision.ok) {
      const step: AgentStep = {
        turn,
        thought: decision.reason,
        action: { kind: 'final', answer: '' },
        error: decision.reason,
      };
      steps.push(step);
      record(step);
      messages.push({ role: 'assistant', content: res.content || '(sin contenido)' });
      messages.push({
        role: 'user',
        content: `El formato de tu decisión no fue válido: ${decision.reason}. Volvé a decidir usando JSON estricto.`,
      });
      continue;
    }

    if (decision.action.kind === 'final') {
      const step: AgentStep = { turn, thought: decision.thought, action: decision.action };
      steps.push(step);
      record(step);
      return { answer: decision.action.answer, turns: turn, steps };
    }

    // act + observe (con resolución de nombre: "searchgoogle" → "search_google")
    const step: AgentStep = { turn, thought: decision.thought, action: decision.action };
    const toolName = input.registry.resolve(decision.action.tool);
    const toolArgs = decision.action.args;
    let blockedReason: string | undefined;

    // Valla 1: guardrails (denylist / repetición)
    const guard = input.guards?.beforeTool(toolName, toolArgs);
    if (guard && !guard.allowed) {
      blockedReason = `guardrail: ${guard.reason}`;
      // Valla 2: aprobación humana (human-in-the-loop) para tools críticos
    } else if (input.approval && input.approval.requiredTools.includes(toolName)) {
      const decision = await input.approval.approver.request({
        goal: input.userInput,
        turn,
        tool: toolName,
        args: toolArgs,
      });
      if (!decision.approved) {
        blockedReason = `aprobación humana rechazada: ${decision.note ?? 'sin nota'}`;
      }
    }

    if (blockedReason) {
      step.error = blockedReason;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: `No se ejecutó "${toolName}": ${blockedReason}. Elegí otra acción o respondé con kind=final.`,
      });
      steps.push(step);
      record(step);
      continue;
    }

    try {
      const result = await toolCallWithObserver(
        () => input.registry.execute(toolName, toolArgs),
        turn,
        toolName,
        input.observer,
      );
      step.result = result;
      const resultText = JSON.stringify(result);
      // Contexto acotado: un resultado enorme (ej. páginas enteras) petrifica el
      // prompt y hace lentas las decisiones del modelo local.
      const capped = resultText.length > 8000 ? resultText.slice(0, 8000) + '\n…(resultado truncado)' : resultText;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: `Resultado de "${toolName}": ${capped}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      step.error = message;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: `Error al ejecutar "${toolName}": ${message}. Elegí otro tool o respondé con kind=final.`,
      });
    } finally {
      input.guards?.afterTool(toolName, toolArgs);
    }
    steps.push(step);
    record(step);
  }

  // Sin turnos (o guardrail de presupuesto): forzar una conclusión.
  messages.push({
    role: 'user',
    content:
      budgetHitReason !== undefined
        ? `Guardrail de presupuesto activado: ${budgetHitReason}. No podés llamar más tools. ` +
          'Respondé ahora con kind=final y una conclusión basada en lo observado.'
        : 'Se agotaron los turnos de la tarea. No podés llamar más tools. Respondé ahora con kind=final y una conclusión basada en lo observado.',
  });
  const finalRes = await callDecision(input, messages, schema, input.maxTurns + 1).catch(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      return synthesizeAnswer(input, steps, `el modelo falló al intentar concluir: ${message}`);
    },
  );
  input.guards?.afterLlmCall(
    typeof finalRes === 'string' ? undefined : finalRes.usage,
  );
  const decision = typeof finalRes === 'string' ? null : parseDecision(finalRes.content);
  if (decision && decision.ok && decision.action.kind === 'final') {
    const step: AgentStep = {
      turn: input.maxTurns + 1,
      thought: decision.thought,
      action: decision.action,
    };
    steps.push(step);
    record(step);
    return { answer: decision.action.answer, turns: input.maxTurns + 1, steps };
  }

  return {
    answer:
      budgetHitReason !== undefined
        ? `El ciclo se cortó antes de tiempo: ${budgetHitReason}. ` +
          'Abajo va un resumen de lo observado (sin inventar nada).\n\n' +
          synthesizeAnswer(input, steps, `se cortó por presupuesto: ${budgetHitReason}`)
        : 'El agente no llegó a una conclusión en el límite de turnos configurado.',
    turns: input.maxTurns,
    steps,
  };
}

/** Conclusión determinista (sin LLM) basada solo en los pasos ya ejecutados. */
function synthesizeAnswer(input: LoopInput, steps: AgentStep[], reason: string): string {
  const isToolStep = (
    s: AgentStep,
  ): s is AgentStep & { action: Extract<AgentAction, { kind: 'tool' }> } =>
    s.action.kind === 'tool' && !s.error;

  const lines: string[] = [];
  const useful = steps.filter(isToolStep);
  if (useful.length > 0) {
    lines.push('Lo que alcancé a investigar:');
    for (const s of useful.slice(-4)) {
      const args = JSON.stringify(s.action.args);
      lines.push(`  - ${s.action.tool}${args.length > 0 ? ` ${args.slice(0, 160)}` : ''}`);
    }
  }
  const saved = steps.filter(
    (s) => isToolStep(s) && s.action.tool === 'save_lead',
  );
  if (saved.length > 0) {
    lines.push(`Leads guardados en la corrida: ${saved.length}.`);
    for (const s of saved.slice(-3)) {
      const r = s.result as { name?: string; score?: number } | undefined;
      lines.push(`  - ${r?.name ?? '(sin nombre)'}${r?.score !== undefined ? ` (score ${r.score})` : ''}`);
    }
  }
  if (lines.length === 0) lines.push('No hubo pasos completados antes del corte.');
  lines.push('');
  lines.push(`Nota: ${reason}. Este resumen se basa solo en lo observado, sin inventar.`);
  return lines.join('\n');
}

function toolNamesOf(registry: ToolRegistry): string[] {
  let cached = toolNamesCache.get(registry);
  if (!cached) {
    cached = registry.list().map((t) => t.name);
    toolNamesCache.set(registry, cached);
  }
  return cached;
}

/** Decisión del modelo: stream si el loop lo pide y el provider lo soporta. */
async function callDecision(
  input: LoopInput,
  messages: ChatMessage[],
  schema: JsonSchema,
  turn: number,
): Promise<ChatResult> {
  const stream = input.stream && input.onToken && typeof input.provider.stream === 'function';
  return chatWithObserver(
    () => {
      const options = { jsonSchema: schema, temperature: 0 };
      return stream
        ? (input.provider.stream?.(messages, options, input.onToken) ??
            input.provider.chat(messages, options))
        : input.provider.chat(messages, options);
    },
    turn,
    input.observer,
  );
}

async function chatWithObserver<T>(
  call: () => Promise<T>,
  turn: number,
  observer?: AgentObserver,
): Promise<T> {
  const t0 = performance.now();
  try {
    const res = await call();
    const usage = (res as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
    observer?.onLlmCall({
      turn,
      ms: performance.now() - t0,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
    });
    return res;
  } catch (err) {
    observer?.onLlmCall({ turn, ms: performance.now() - t0, promptTokens: 0, completionTokens: 0 });
    throw err;
  }
}

async function toolCallWithObserver(
  call: () => Promise<unknown>,
  turn: number,
  tool: string,
  observer?: AgentObserver,
): Promise<unknown> {
  const t0 = performance.now();
  try {
    const result = await call();
    observer?.onToolCall({ turn, tool, ms: performance.now() - t0, ok: true });
    return result;
  } catch (err) {
    observer?.onToolCall({
      turn,
      tool,
      ms: performance.now() - t0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}