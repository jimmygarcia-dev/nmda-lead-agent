import type { LLMProvider } from './LLMProvider.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { OllamaProvider } from './OllamaProvider.js';

/**
 * Crea el provider según LLM_PROVIDER (default 'ollama').
 * Este es el único lugar que cambia al conectar una API nueva.
 */
export function createLLMProvider(name?: string): LLMProvider {
  const provider = name ?? process.env.LLM_PROVIDER ?? 'ollama';
  switch (provider) {
    case 'ollama':
      return new OllamaProvider();
    case 'deepseek':
      return new DeepSeekProvider();
    default:
      throw new Error(
        `LLM_PROVIDER desconocido: ${provider}. Usá "ollama" o "deepseek".`,
      );
  }
}