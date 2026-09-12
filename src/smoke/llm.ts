import 'dotenv/config';
import { OllamaProvider } from '../llm/OllamaProvider.js';

const provider = new OllamaProvider();

console.log('--- PHASE 1: smoke test LLM (Ollama) ---');
console.log(`provider: ${provider.name}`);
console.log(`model:    ${provider.modelName}`);
console.log('');

const res = await provider.chat(
  [
    { role: 'system', content: 'Responde en una sola frase, en español.' },
    { role: 'user', content: '¿Qué es un lead calificado?' },
  ],
  { temperature: 0 },
);

console.log('respuesta del modelo:');
console.log(res.content);
console.log('');
console.log(`usage: ${res.usage ? `${res.usage.promptTokens} → ${res.usage.completionTokens} tokens` : 'n/d'}`);