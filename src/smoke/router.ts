import 'dotenv/config';
import type { ChatMessage, ChatOptions, ChatResult } from '../llm/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { LLMRouter, ROUTE_QUALITY } from '../llm/LLMRouter.js';
import { createRoutedProvider } from '../llm/providerFactory.js';

class RecordingProvider implements LLMProvider {
  readonly name: string;
  readonly modelName: string;
  calls = 0;

  constructor(name: string, modelName: string) {
    this.name = name;
    this.modelName = modelName;
  }

  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    this.calls++;
    return { content: 'ok' };
  }
}

function fails(s: string) { throw new Error('router FAIL: ' + s) }

const def = new RecordingProvider('default', 'qwen-local');
const qual = new RecordingProvider('quality', 'deepseek');

// (1) ruteo correcto
const router = new LLMRouter({ defaultProvider: def, qualityProvider: qual });
await router.chat([{ role: 'user', content: 'x' }]);
await router.chat([{ role: 'user', content: 'x' }], { route: ROUTE_QUALITY });
if (def.calls !== 1 || qual.calls !== 1) fails(`rutas (default=${def.calls}, quality=${qual.calls})`);
console.log('(1) rutas default/quality OK');

// (2) fallback cuando no hay provider de calidad
const routerNoQual = new LLMRouter({ defaultProvider: def });
await routerNoQual.chat([{ role: 'user', content: 'x' }], { route: ROUTE_QUALITY });
if (def.calls !== 2) fails(`fallback (default=${def.calls})`);
console.log('(2) fallback a default sin provider de calidad OK');

// (3) estado real con .env
console.log('');
console.log('(3) estado actual con tu .env:');
const real = createRoutedProvider();
console.log(`  router: default=${real.defaultProvider.name} (${real.defaultProvider.modelName})`);
if (real.qualityProvider) {
  console.log(`  calidad: ${real.qualityProvider.name} (${real.qualityProvider.modelName})`);
} else {
  console.log('  calidad: SIN key -> email/valoración usan el modelo local (fallback)');
}
console.log('');
console.log('--- fin ---');