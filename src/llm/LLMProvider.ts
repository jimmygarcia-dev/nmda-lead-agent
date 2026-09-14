import type { ChatMessage, ChatOptions, ChatResult } from './types.js';

/**
 * Interfaz propia del proyecto para hablar con un LLM.
 * Permite cambiar de proveedor (Ollama, OpenAI, Anthropic, DeepSeek)
 * sin tocar el core del agente.
 */
export interface LLMProvider {
  readonly name: string;
  readonly modelName: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  /**
   * Streaming opcional (estilo Claude): devuelve los tokens por onToken en vivo
   * y además el ChatResult completo al terminar. Si no está implementado, el
   * loop cae a chat() y los onToken se emiten de una sola vez.
   */
  stream?(
    messages: ChatMessage[],
    options?: ChatOptions,
    onToken?: (delta: string) => void,
  ): Promise<ChatResult>;
}