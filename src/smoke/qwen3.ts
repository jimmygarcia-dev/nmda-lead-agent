import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import type { ChatResult } from '../llm/types.js';

const provider = new OllamaProvider({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b' });

function report(label: string, ms: number, r: ChatResult, parsed?: unknown) {
  const tok = r.usage ? r.usage.completionTokens : 0;
  const tokS = ms > 0 ? ((tok / ms) * 1000).toFixed(1) : '-';
  console.log(`  ${label}: ${ms.toFixed(0)} ms | ${tok} tok out | ${tokS} tok/s`);
  console.log(`  JSON.parse: ${parsed !== undefined ? 'OK' : (() => { try { JSON.parse((r.content ?? '').replace(/^```json\s*|\s*```$/g, '')); return 'OK (fences)'; } catch { return 'NO'; } })()}`);
}

console.log(`--- smoke qwen3 (${provider.modelName}, thinking ${process.env.QWEN3_THINK ? 'ON' : 'OFF'}) ---`);
console.log('');

// (1) JSON estricto con schema (estilo decisión del loop)
const schema = {
  type: 'object',
  properties: {
    tool: { type: 'string' },
    args: { type: 'object' },
    reason: { type: 'string' },
  },
  required: ['tool', 'reason'],
};
console.log('(1) decisión del loop (JSON schema):');
const t1 = performance.now();
const r1 = await provider.chat(
  [
    {
      role: 'system',
      content:
        'Sos el orquestador de un agente de prospección. El usuario quiere encontrar agencias de diseño web en México. Devuelve SOLO un JSON con la próxima acción.',
    },
    { role: 'user', content: '¿Qué hago ahora?' },
  ],
  { jsonSchema: schema, temperature: 0 },
);
const m1 = performance.now() - t1;
let p1: unknown;
try {
  p1 = JSON.parse(r1.content.replace(/^```json\s*|\s*```$/g, ''));
} catch {
  p1 = undefined;
}
report('   decisión', m1, r1, p1);
if (p1) console.log(`   → ${JSON.stringify(p1).slice(0, 160)}`);
console.log('');

// (2) respuesta final en texto (sin schema) — que no haya micro-bloque de thinking
console.log('(2) respuesta final en texto:');
const t2 = performance.now();
const r2 = await provider.chat(
  [
    {
      role: 'system',
      content: 'Sos un asistente de prospección B2B. Respondé conciso, en español.',
    },
    { role: 'user', content: 'Resumen la agencia Estudio Pixel en una frase.' },
  ],
  { temperature: 0.7 },
);
const m2 = performance.now() - t2;
report('   respuesta', m2, r2);
console.log(`   contenido: ${(r2.content ?? '').slice(0, 200)}`);
console.log('');
if (!/＜(.|\n)*＞|😊|Voy a/i.test(r2.content ?? '') && r2.content.trim().length < 300) {
  console.log('VERDE: qwen3 sin thinking, JSON estricto y salida limpia');
} else {
  console.log('ROJO: revisar salida (razonamiento o verbosidad)');
}