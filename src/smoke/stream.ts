import 'dotenv/config';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import type { ChatMessage } from '../llm/types.js';

async function ollamaUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await ollamaUp())) {
  console.log('SKIP: ollama no está corriendo (abrí la app de Ollama y volvé a correr).');
  process.exit(0);
}

const provider = new OllamaProvider();
const messages: ChatMessage[] = [
  {
    role: 'system',
    content: 'Sos un asistente. Respondé un único JSON: {"nemo":"ok"}',
  },
  { role: 'user', content: 'Saludá.' },
];

console.log(`--- smoke stream (${provider.modelName}) ---`);
console.log('');

const t0 = performance.now();
let deltas = 0;
let streamed = '';
const streamedRes = await provider.stream!(messages, {}, (d) => {
  deltas += 1;
  streamed += d;
});
const ms = performance.now() - t0;

console.log(`  chunks: ${deltas}`);
console.log(`  tokens: ${streamedRes.usage?.completionTokens ?? '?'}`);
const tokS = streamedRes.usage?.completionTokens && ms > 0
  ? ((streamedRes.usage.completionTokens / ms) * 1000).toFixed(1)
  : '-';
console.log(`  ${ms.toFixed(0)} ms | ${tokS} tok/s`);
console.log('');

let parsedOk = false;
try {
  const v = JSON.parse(streamedRes.content) as unknown;
  parsedOk = Boolean(v && typeof v === 'object');
} catch {
  parsedOk = false;
}

const equal = streamedRes.content === streamed;
console.log(`  stream() devuelve el contenido completo acumulado: ${equal ? 'OK' : 'NO'}`);
console.log(`  JSON final parsea: ${parsedOk ? 'OK' : 'NO'}`);
console.log(`  respuesta: ${streamedRes.content.slice(0, 80)}`);
console.log('');
console.log(
  equal && parsedOk && deltas > 1
    ? 'VERDE: streaming NDJSON real (múltiples chunks), ChatResult íntegro'
    : 'ROJO: revisar',
);