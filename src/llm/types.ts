export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolParameterSchema {
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ChatOptions {
  temperature?: number;
  format?: 'json';
  jsonSchema?: Record<string, unknown>;
  tools?: ToolDefinition[];
  /** Ruta de proveedor para LLMRouter (default | quality). Otros providers lo ignoran. */
  route?: string;
}

export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}