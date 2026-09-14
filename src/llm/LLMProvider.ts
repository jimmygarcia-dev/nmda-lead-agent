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
}