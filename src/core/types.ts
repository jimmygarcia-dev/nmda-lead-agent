import type { AgentMemory } from '../memory/memory.js';
import type { ApprovalGate } from '../approval/types.js';
import type { Guardrails } from '../guardrails/guardrails.js';
import type { AgentObserver } from '../observability/types.js';
import type { QualificationCriteria } from '../qualification/types.js';
import type { ToolParameterSchema } from './../llm/types.js';

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentMessage {
  role: AgentRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface AgentStep {
  turn: number;
  thought: string;
  action: AgentAction;
  result?: unknown;
  error?: string;
}

export type AgentAction =
  | { kind: 'tool'; tool: string; args: Record<string, unknown> }
  | { kind: 'final'; answer: string };

export interface AgentContext {
  goal: string;
  messages: AgentMessage[];
  stepHistory: AgentStep[];
  maxTurns: number;
}

export interface AgentConfig {
  maxTurns?: number;
  /** Mínimo de search_google exitosas antes de permitir concluir (default: 2). */
  minSearchesBeforeFinal?: number;
  onStep?: (step: AgentStep) => void;
  verbose?: boolean;
  criteria?: QualificationCriteria;
  memory?: AgentMemory;
  observer?: AgentObserver;
  guards?: Guardrails;
  approval?: ApprovalGate;
  /** Voz/estilo de la persona a inyectar en el system prompt (ej. identidad de marca). */
  persona?: string;
  /** Streaming en vivo de tokens si el provider lo soporta. */
  stream?: boolean;
  /** Recibe cada delta de token (para render tipo Claude). */
  onToken?: (delta: string) => void;
}

export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  turns: number;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameterSchema;
  execute(args: Record<string, unknown>): Promise<unknown> | unknown;
}