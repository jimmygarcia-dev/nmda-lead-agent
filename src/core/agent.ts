import type { LLMProvider } from '../llm/LLMProvider.js';
import type { ToolRegistry } from '../tools/registry.js';
import { runLoop } from './loop.js';
import type { AgentConfig, AgentResult, AgentStep } from './types.js';

const DEFAULT_MAX_TURNS = 5;

function buildSystemPrompt(registry: ToolRegistry): string {
  const tools = registry
    .list()
    .map(
      (t) =>
        `- ${t.name}: ${t.description} Parámetros (JSON Schema): ${JSON.stringify(t.parameters)}`,
    )
    .join('\n');

  return [
    'Sos un agente autónomo. Tu objetivo es interpretar la petición del usuario, planear y',
    'decidir paso a paso. En cada turno decidís UNA acción, en formato JSON estricto:',
    '',
    '  { "thought": "...", "action": { "kind": "tool", "tool": "<nombre>", "args": { ... } } }',
    '  { "thought": "...", "action": { "kind": "final", "answer": "..." } }',
    '',
    '- Usá kind=tool cuando necesites información nueva o ejecutar una búsqueda.',
    '- Después de observar el resultado del tool, evaluá si alcanzó para responder. Si no,',
    '  podés llamar otro tool (ej. afinar la búsqueda) o finalizar.',
    '- Usá kind=final solo cuando ya puedas responder con la información disponible.',
    '- La respuesta final va en idioma del usuario, clara y concreta. Si citás fuentes,',
    '  usá las URLs que devolvieron los tools.',
    '',
    'Tools disponibles:',
    '',
    tools || '(ninguno)',
  ].join('\n');
}

export class Agent {
  private readonly provider: LLMProvider;
  private readonly registry: ToolRegistry;
  private readonly config: {
    maxTurns: number;
    onStep?: (step: AgentStep) => void;
    verbose: boolean;
  };

  constructor(provider: LLMProvider, registry: ToolRegistry, config: AgentConfig = {}) {
    this.provider = provider;
    this.registry = registry;
    this.config = {
      maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
      onStep: config.onStep,
      verbose: config.verbose ?? false,
    };
  }

  async run(userInput: string): Promise<AgentResult> {
    const onStep: (step: AgentStep) => void =
      this.config.onStep ??
      ((step: AgentStep) => {
        if (this.config.verbose) {
          console.log(`[turno ${step.turn}] ${step.thought}`);
        }
      });

    const { answer, turns, steps } = await runLoop({
      provider: this.provider,
      registry: this.registry,
      systemPrompt: buildSystemPrompt(this.registry),
      userInput,
      maxTurns: this.config.maxTurns,
      onStep,
    });

    return { answer, turns, steps };
  }
}