import type { LLMProvider } from './LLMProvider.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { LLMRouter } from './LLMRouter.js';

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

/**
 * Proveedor de calidad para tareas que exigen mejor modelo
 * (email, valoración). Si no hay DEEPSEEK_API_KEY, no se usa:
 * el router cae al modelo local.
 */
export function createQualityProvider(): LLMProvider | undefined {
  return process.env.DEEPSEEK_API_KEY ? new DeepSeekProvider() : undefined;
}

/**
 * Provider enrutado: loop con el default (local) y tareas de calidad
 * con DeepSeek cuando hay key. Aparear con los tools write_email y value_page.
 */
export function createRoutedProvider(): LLMRouter {
  return new LLMRouter({
    defaultProvider: createLLMProvider(),
    qualityProvider: createQualityProvider(),
  });
}