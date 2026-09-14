import type { ChatMessage, ChatOptions, ChatResult, ToolCall } from './types.js';
import type { ToolDefinition } from './types.js';
import type { LLMProvider } from './LLMProvider.js';

export interface DeepSeekConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
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

/** Mapea ChatMessage propio → mensaje compatible OpenAI (DeepSeek usa ese formato). */
function toDeepSeekMessage(m: ChatMessage): Record<string, unknown> {
  const msg: Record<string, unknown> = { role: m.role };
  if (m.content !== undefined) msg.content = m.content;
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

function toToolDefinition(t: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}

/**
 * Provider para APIs compatibles con OpenAI (DeepSeek, y por extensión OpenAI
 * mismo). Estrategia de JSON estricto: a diferencia de Ollama (format=schema),
 * acá se usa response_format json_object (fuerza JSON válido, sin schema).
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: DeepSeekConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
    this.model = config.model ?? process.env.LLM_MODEL ?? 'deepseek-chat';
    this.baseUrl = (config.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '');
  }

  get modelName(): string {
    return this.model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toDeepSeekMessage),
      stream: false,
      temperature: options.temperature ?? 0,
    };

    if (options.jsonSchema || options.format === 'json') {
      body.response_format = { type: 'json_object' };
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(toToolDefinition);
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek /chat/completions respondió ${res.status}: ${text}`);
    }

    const data = (await res.json()) as DeepSeekResponse;
    const message = data.choices?.[0]?.message;

    const result: ChatResult = {
      content: message?.content ?? '',
    };

    if (data.usage && data.usage.prompt_tokens !== undefined) {
      result.usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens ?? 0,
      };
    }

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