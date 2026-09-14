import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { ToolRegistry } from '../tools/registry.js';
import { createSearchTool } from '../search/index.js';
import { createWebsiteTool } from '../tools/website.js';
import { createQualifyTool } from '../tools/qualify.js';
import { createSaveLeadTool } from '../tools/saveLead.js';
import { createRecallMemoryTool } from '../tools/recall.js';
import { LeadStore } from '../persistence/store.js';
import { AgentMemory } from '../memory/memory.js';
import type { QualificationCriteria } from '../qualification/types.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true });

const store = new LeadStore(dbPath);

// Sembramos "memoria de días anteriores"
store.saveLead({
  name: 'Soporte Digital Labs',
  url: 'https://soportedigital.fake',
  location: 'México',
  score: 59,
  result: 'quizás',
  reasons: ['Coincide la ubicación buscada: mexico.'],
  matched: ['diseño web'],
});
store.saveLead({
  name: 'Zapatería Don Pepe',
  url: 'https://zapateria-pepe.fake',
  location: 'Guadalajara',
  score: 0,
  result: 'no',
  reasons: ['No coincide ubicación, servicios ni palabras clave.'],
  matched: [],
});
store.saveRun({
  goal: 'Auditar agencias de diseño web en México',
  answer: 'Audité 2 candidatas; una descartada (Zapatería) y una en duda (Soporte Digital).',
  turns: 3,
});

const memory = new AgentMemory(store);
const criteria: QualificationCriteria = {
  label: 'Agencia de diseño y desarrollo web en México',
  locations: ['mexico', 'cdmx'],
  industries: ['agencia digital', 'desarrollo de software'],
  services: ['diseño web', 'desarrollo web', 'e-commerce', 'landing pages'],
  keywords: ['seo', 'aplicaciones', 'posicionamiento'],
  minScore: 60,
};

console.log('--- PHASE 5: smoke test memory ---');
console.log('');
console.log('Contexto de memoria que se inyecta al agente:');
console.log('-------------------------------------------');
console.log(memory.toContextText(memory.recall()));
console.log('-------------------------------------------');
console.log('');

const provider = new OllamaProvider();
const registry = new ToolRegistry()
  .register(createSearchTool())
  .register(createWebsiteTool())
  .register(createQualifyTool(criteria))
  .register(createSaveLeadTool(store))
  .register(createRecallMemoryTool(memory));
const agent = new Agent(provider, registry, {
  maxTurns: 5,
  verbose: true,
  criteria,
  memory,
});

const goal =
  process.argv.slice(2).join(' ').trim() ||
  'Buscá UNA agencia de diseño web en México que NO hayamos auditado antes. ' +
    'Revisá la memoria (recall_memory) para no repetir. Tomá el PRIMER resultado nuevo, ' +
    'abrila con fetch_page, y pasale a qualify_lead el TEXTO COMPLETO de la página. ' +
    'Si da sí o quizás, guardala con save_lead y respondé.';

console.log(`objetivo: ${goal}\n`);
const result = await agent.run(goal);

console.log('');
console.log(`--- respuesta del agente (${result.turns} turno(s)) ---`);
console.log(result.answer);
console.log('');
console.log('--- resumen de pasos ---');
for (const step of result.steps) {
  const action =
    step.action.kind === 'tool'
      ? `${step.action.tool}(${JSON.stringify(step.action.args)})`
      : 'final: ' + step.action.answer.slice(0, 60);
  const status = step.error ? `ERROR: ${step.error}` : step.result ? 'ok' : '';
  console.log(`  [${step.turn}] ${step.thought} -> ${action} ${status}`.trim());
}

console.log('');
console.log('--- estado final de la memoria (leads) ---');
for (const lead of store.listLeads()) {
  console.log(`  [${lead.id}] ${lead.result.toUpperCase()} ${lead.score}/100 - ${lead.name} (${lead.url})`);
}

store.close();