import 'dotenv/config';
import { Agent } from '../core/agent.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ChatMessage, ChatOptions, ChatResult } from '../llm/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';

/** Provider grabador: no llama a ningún LLM, devuelve kind=final y registra los mensajes. */
class RecordingProvider implements LLMProvider {
  readonly name = 'recording';
  readonly modelName = 'recording';
  calls: Array<ChatMessage[]> = [];

  constructor() {
    // no-op
  }

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    this.calls.push(messages);
    return {
      content: JSON.stringify({
        thought: 'respuesta programada del smoke',
        action: { kind: 'final', answer: 'respondido' },
      }),
    };
  }
}

const registry = {
  list: () => [],
  register: () => registry,
  execute: async () => ({}),
} as unknown as ToolRegistry;

const provider = new RecordingProvider();
const agent = new Agent(provider, registry, { maxTurns: 2 });

console.log('--- smoke multi-turno (sesión) ---');
console.log('');

await agent.run('buscá una agencia de diseño web');
const first = provider.calls[provider.calls.length - 1];
const firstUser = first[first.length - 1]?.content ?? '';
console.log('(1) primer pedido, sin contexto:');
console.log(`    contiene etiqueta de sesión? ${firstUser.includes('Contexto de la sesión') ? 'NO (correcto)' : 'correcto'}`);

await agent.run('ahora escribile un email a la agencia que guardaste', {
  sessionContext:
    '* Pedido: buscá una agencia de diseño web\n  - guardó lead: "Estudio Pixel" (id 1, resultado sí)',
});
const second = provider.calls[provider.calls.length - 1];
const secondUser = second[second.length - 1]?.content ?? '';
console.log('');
console.log('(2) segundo pedido, con contexto de sesión:');
console.log(secondUser.replaceAll('\n', '\n    '));
console.log('');

const ok =
  secondUser.includes('Contexto de la sesión') &&
  secondUser.includes('Estudio Pixel') &&
  secondUser.includes('escribile un email');
console.log(ok ? 'VERDE: el contexto de la sesión llega al modelo; el loop no cambia' : 'ROJO: revisar');