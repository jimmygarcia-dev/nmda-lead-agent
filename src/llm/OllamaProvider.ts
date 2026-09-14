import type { ChatMessage, ChatResult, ToolCall } from './types.js';
import type { JsonSchema } from '../types/jsonSchema.js';

export interface OllamaConfig {
  host?: string;
  model?: string;
}

export interface ChatOptions {
  temperature?: number;
  jsonSchema?: JsonSchema;
  /**
   * Desactiva el modo thinking (token `&lt;|ne|&gt;` al último mensaje).
   * Defecto: OFF para la familia qwen3 (lección de este repo — el thinking no
   * respeta JSON estricto), ON para el resto. Se sobreescribe con think: true/false.
   */
  think?: boolean;
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
  private readonly timeoutMs: number;

  constructor(config: OllamaConfig = {}) {
    this.host = (config.host ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
    // Timeout por llamada (default 10 min): Ollama local con contexto grande puede
    // tardar minutos en una decisión; si se traba de verdad, corta con error claro
    // (y el loop concluye con lo observado en vez de morir).
    this.timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 600_000);
  }

  get modelName(): string {
    return this.model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    // Lección de este repo: los qwen3 con thinking no respetan el JSON estricto y
    // ensucian las respuestas finales con bloques de razonamiento. Para la familia
    // qwen3 el thinking queda apagado por defecto (se rehabilita con think: true).
    const isQwen3 = /qwen3/i.test(this.model);
    const toSend = messages.map(toOllamaMessage);
    if ((options.think ?? !isQwen3) === false && toSend.length > 0) {
      const last = toSend[toSend.length - 1];
      if (typeof last.content === 'string' && last.content.length > 0) {
        last.content += '<|ne|>';
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: toSend,
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
      signal: AbortSignal.timeout(this.timeoutMs),
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

  /** Streaming NDJSON de /api/chat (stream:true). Devuelve el ChatResult completo. */
  async stream(
    messages: ChatMessage[],
    options: ChatOptions = {},
    onToken?: (delta: string) => void,
  ): Promise<ChatResult> {
    const toSend = messages.map(toOllamaMessage);
    if ((options.think ?? !/qwen3/i.test(this.model)) === false && toSend.length > 0) {
      const last = toSend[toSend.length - 1];
      if (typeof last.content === 'string' && last.content.length > 0) {
        last.content += '<|ne|>';
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: toSend,
      stream: true,
      temperature: options.temperature ?? 0,
    };
    if (options.jsonSchema) {
      body.format = options.jsonSchema;
    }

    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama /api/chat respondió ${res.status}: ${text}`);
    }

    let content = '';
    let promptEval: number | undefined;
    let evalCount: number | undefined;
    let toolCalls: ToolCall[] | undefined;

    if (!res.body) throw new Error('Ollama no devolvió body de streaming.');

    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      const text = decoder.decode(chunk, { stream: true });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const delta = (data.message as { content?: string })?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          onToken?.(delta);
        }
        if (typeof data.prompt_eval_count === 'number') promptEval = data.prompt_eval_count;
        if (typeof data.eval_count === 'number') evalCount = data.eval_count;
        if (data.message && Array.isArray((data.message as { tool_calls?: unknown[] }).tool_calls)) {
          toolCalls = ((data.message as { tool_calls?: unknown[] }).tool_calls as Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>).map((tc) => ({
            id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
            name: tc.function?.name ?? '',
            arguments: parseArguments(tc.function?.arguments),
          }));
        }
      }
    }

    const result: ChatResult = { content };
    if (promptEval !== undefined) {
      result.usage = { promptTokens: promptEval, completionTokens: evalCount ?? 0 };
    }
    if (toolCalls && toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }
    return result;
  }
}