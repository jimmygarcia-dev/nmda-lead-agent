import type { ChatMessage, ChatResult, ToolCall } from './types.js';
import type { JsonSchema } from '../types/jsonSchema.js';

export interface OllamaConfig {
  host?: string;
  model?: string;
}

export interface ChatOptions {
  temperature?: number;
  jsonSchema?: JsonSchema;
}

interface OllamaResponse {
  message?: {
    content?: string;
    tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return {};
  }
}

function toOllamaMessage(m: ChatMessage): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    role: m.role,
    ...(m.content !== undefined ? { content: m.content } : {}),
  };
  if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
  if (m.tool_calls && m.tool_calls.length > 0) {
    msg.tool_calls = m.tool_calls.map((tc: ToolCall) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
    }));
  }
  return msg;
}

export class OllamaProvider {
  readonly name = 'ollama';
  private readonly host: string;
  private readonly model: string;

  constructor(config: OllamaConfig = {}) {
    this.host = (config.host ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
  }

  get modelName(): string {
    return this.model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toOllamaMessage),
      stream: false,
      temperature: options.temperature ?? 0,
    };

    if (options.jsonSchema) {
      body.format = options.jsonSchema;
    }

    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama /api/chat respondió ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OllamaResponse;
    const message = data.message;

    const result: ChatResult = {
      content: message?.content ?? '',
      ...(data.prompt_eval_count !== undefined
        ? { usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count ?? 0 } }
        : {}),
    };

    if (message?.tool_calls && message.tool_calls.length > 0) {
      result.toolCalls = message.tool_calls.map((tc) => ({
        id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
        name: tc.function?.name ?? '',
        arguments: parseArguments(tc.function?.arguments),
      }));
    }

    return result;
  }
}