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
    // Default deepseek-v4-pro: responde (16/09/2026 deepseek-flash queda colgado en
    // generaciones). flash es más barato; seteá LLM_MODEL=deepseek-flash cuando vuelva.
    this.model = config.model ?? process.env.LLM_MODEL ?? 'deepseek-v4-pro';
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

    // Thinking: OFF por default (decisiones rápidas del loop). Cuando se usa con tools
    // DEBE estar OFF porque DeepSeek exige pasar reasoning_content en la siguiente ronda
    // y nuestro loop no lo hace → forzamos OFF si hay tools.
    const useThinking =
      options.think === true && !(options.tools && options.tools.length > 0);
    body.thinking = { type: useThinking ? 'enabled' : 'disabled' };

    // 150s: si la API se cuelga (ej. deepseek-flash 16/09/2026) falla con error claro
    // en vez de quedarse girando para siempre.
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
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

  /** Streaming SSE de /chat/completions (OpenAI-compatible). Devuelve el ChatResult completo. */
  async stream(
    messages: ChatMessage[],
    options: ChatOptions = {},
    onToken?: (delta: string) => void,
  ): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toDeepSeekMessage),
      stream: true,
      stream_options: { include_usage: true },
      temperature: options.temperature ?? 0,
    };
    if (options.jsonSchema || options.format === 'json') {
      body.response_format = { type: 'json_object' };
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(toToolDefinition);
    }
    const useThinking =
      options.think === true && !(options.tools && options.tools.length > 0);
    body.thinking = { type: useThinking ? 'enabled' : 'disabled' };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek /chat/completions respondió ${res.status}: ${text}`);
    }
    if (!res.body) throw new Error('DeepSeek no devolvió body de streaming.');

    let content = '';
    let usage: ChatResult['usage'];
    // En streaming las tool_calls llegan fragmentadas por index en delta.tool_calls
    // (id al inicio, name en el primer fragmento, arguments acumulados). message.tool_calls
    // no viene en streaming → hay que agregar los deltas por index.
    const toolCalls: Array<{ index?: number; id?: string; name?: string; args?: string }> = [];

    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      const text = decoder.decode(chunk, { stream: true });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        let data: DeepSeekResponse & {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          onToken?.(delta);
        }
        const deltaCalls = data.choices?.[0]?.delta?.tool_calls;
        if (deltaCalls && deltaCalls.length > 0) {
          for (const call of deltaCalls) {
            const index = call.index ?? 0;
            if (!toolCalls[index]) toolCalls[index] = { index };
            if (call.id) toolCalls[index].id = call.id;
            if (call.function?.name) toolCalls[index].name = call.function.name;
            if (call.function?.arguments) {
              toolCalls[index].args = (toolCalls[index].args ?? '') + call.function.arguments;
            }
          }
        }
        if (data.usage && data.usage.prompt_tokens !== undefined) {
          usage = {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens ?? 0,
          };
        }
        const tc = data.choices?.[0]?.message?.tool_calls;
        if (tc && tc.length > 0) toolCalls.push(...tc);
      }
    }

    const result: ChatResult = { content };
    if (usage) result.usage = usage;
    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls.map((tc) => ({
        id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
        name: tc.name ?? '',
        arguments: parseArguments(tc.args),
      }));
    }
    return result;
  }
}