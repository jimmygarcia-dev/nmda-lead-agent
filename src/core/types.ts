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
  onStep?: (step: AgentStep) => void;
  verbose?: boolean;
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