import type { ChatMessage } from '../llm/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
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
  const record = (step: AgentStep) => {
    input.onStep?.(step);
  };

  for (let turn = 1; turn <= input.maxTurns; turn++) {
    const res = await input.provider.chat(messages, { jsonSchema: schema, temperature: 0 });

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

    // act + observe
    const step: AgentStep = { turn, thought: decision.thought, action: decision.action };
    try {
      const result = await input.registry.execute(decision.action.tool, decision.action.args);
      step.result = result;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: `Resultado de "${decision.action.tool}": ${JSON.stringify(result)}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      step.error = message;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: `Error al ejecutar "${decision.action.tool}": ${message}. Elegí otro tool o respondé con kind=final.`,
      });
    }
    steps.push(step);
    record(step);
  }

  // Sin turnos: forzar una conclusión.
  messages.push({
    role: 'user',
    content:
      'Se agotaron los turnos de la tarea. No podés llamar más tools. Respondé ahora con kind=final y una conclusión basada en lo observado.',
  });
  const finalRes = await input.provider.chat(messages, { jsonSchema: schema, temperature: 0 });
  const decision = parseDecision(finalRes.content);
  if (decision.ok && decision.action.kind === 'final') {
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
    answer: 'El agente no llegó a una conclusión en el límite de turnos configurado.',
    turns: input.maxTurns,
    steps,
  };
}

function toolNamesOf(registry: ToolRegistry): string[] {
  let cached = toolNamesCache.get(registry);
  if (!cached) {
    cached = registry.list().map((t) => t.name);
    toolNamesCache.set(registry, cached);
  }
  return cached;
}