import type { LLMProvider } from './LLMProvider.js';
import type { ChatMessage, ChatOptions, ChatResult } from './types.js';

export const ROUTE_DEFAULT = 'default';
export const ROUTE_QUALITY = 'quality';

export interface LLMRouterConfig {
  defaultProvider: LLMProvider;
  qualityProvider?: LLMProvider;
}

/**
 * Enruta cada llamada según ChatOptions.route:
 *  - ROUTE_QUALITY → proveedor de calidad (DeepSeek) si está configurado;
 *  - cualquier otra cosa → proveedor default (Ollama local).
 * Sin proveedor de calidad (ej. falta la API key), todo cae al default.
 * El resto del agente no cambia: para él `chat()` sigue igual.
 */
export class LLMRouter implements LLMProvider {
  readonly name = 'router';
  readonly defaultProvider: LLMProvider;
  readonly qualityProvider?: LLMProvider;

  constructor(config: LLMRouterConfig) {
    this.defaultProvider = config.defaultProvider;
    this.qualityProvider = config.qualityProvider;
  }

  get modelName(): string {
    const base = this.defaultProvider.modelName;
    return this.qualityProvider ? `${base} | ${this.qualityProvider.modelName}` : base;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const usesQuality = options.route === ROUTE_QUALITY;
    const provider = usesQuality && this.qualityProvider
      ? this.qualityProvider
      : this.defaultProvider;
    return provider.chat(messages, options);
  }
}