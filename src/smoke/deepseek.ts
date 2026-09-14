import 'dotenv/config';
import { DeepSeekProvider } from '../llm/DeepSeekProvider.js';
import { createLLMProvider } from '../llm/providerFactory.js';
import type { ToolDefinition } from '../llm/types.js';

if (!process.env.DEEPSEEK_API_KEY) {
  console.log('--- PHASE 11: deepseek:test ---');
  console.log('Falta DEEPSEEK_API_KEY en .env -> smoke omitido.');
  console.log('Pegá tu key en .env (o LLM_PROVIDER=deepseek npm run chat) para probar de verdad.');
  process.exit(0);
}

console.log('--- PHASE 11: deepseek:test (provider externo OpenAI-compatible) ---');
console.log('');

// (1) Chat directo con response_format json_object
console.log('(1) Chat con JSON forzado (json_object, sin schema):');
const provider = new DeepSeekProvider();
const chat = await provider.chat(
  [
    {
      role: 'user',
      content:
        'Devolvé unicamente un JSON con {"ciudad":"...","temp_c":N} para México. Nada más.',
    },
  ],
  { jsonSchema: { type: 'object', properties: {} } },
);
console.log(`  content: ${chat.content.trim().slice(0, 200)}`);
console.log(`  usage:   ${JSON.stringify(chat.usage)}`);
console.log('');

// (2) Function calling real (formato OpenAI)
console.log('(2) Function calling real con tools:');
const weatherTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Devuelve la temperatura actual de una ciudad.',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
};
const call = await provider.chat(
  [{ role: 'user', content: '¿Qué temperatura hace en México?' }],
  { tools: [weatherTool] },
);
console.log(`  toolCalls: ${JSON.stringify(call.toolCalls)}`);
console.log('');

// (3) El agente con DeepSeek: mismo stack, provider intercambiable
console.log('(3) Selector por env (LLM_PROVIDER):');
console.log('  factory -> ' + createLLMProvider().name + ' (con LLM_PROVIDER=deepseek da deepseek)');
console.log('');
console.log('--- fin ---');