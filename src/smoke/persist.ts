import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { ToolRegistry } from '../tools/registry.js';
import { createSearchTool } from '../search/index.js';
import { createWebsiteTool } from '../tools/website.js';
import { createQualifyTool } from '../tools/qualify.js';
import { createSaveLeadTool } from '../tools/saveLead.js';
import { LeadStore } from '../persistence/store.js';
import { qualify } from '../qualification/engine.js';
import type { QualificationCriteria } from '../qualification/types.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true }); // arrancamos reproducible

const store = new LeadStore(dbPath);

const criteria: QualificationCriteria = {
  label: 'Agencia de diseño y desarrollo web en Buenos Aires',
  locations: ['buenos aires', 'caba'],
  industries: ['agencia digital', 'desarrollo de software'],
  services: ['diseño web', 'desarrollo web', 'e-commerce', 'landing pages'],
  keywords: ['seo', 'aplicaciones', 'posicionamiento'],
  minScore: 60,
};

console.log('--- PHASE 4: smoke test persistence (SQLite) ---');
console.log(`db: ${dbPath}`);
console.log('');

console.log('(1) Guardado directo de leads vía el motor de qualification:');
const soporte = qualify(
  {
    name: 'Soporte Digital Labs',
    url: 'https://soportedigital.fake',
    location: 'Buenos Aires',
    description: 'Agencia digital en Buenos Aires: diseño web, e-commerce y SEO.',
  },
  criteria,
);
const zapateria = qualify(
  {
    name: 'Zapatería Don Pepe',
    url: 'https://zapateria-pepe.fake',
    location: 'Córdoba',
    description: 'Venta de calzado urbano y formal.',
  },
  criteria,
);

const l1 = store.saveLead({ name: 'Soporte Digital Labs', url: 'https://soportedigital.fake', location: 'Buenos Aires', score: soporte.score, result: soporte.result, reasons: soporte.reasons, matched: soporte.matched });
const l2 = store.saveLead({ name: 'Zapatería Don Pepe', url: 'https://zapateria-pepe.fake', location: 'Córdoba', score: zapateria.score, result: zapateria.result, reasons: zapateria.reasons, matched: zapateria.matched });
const l1again = store.saveLead({ name: 'Soporte Digital Labs', url: 'https://soportedigital.fake', location: 'Buenos Aires', score: 99, result: 'sí', reasons: ['dup'], matched: [] });
console.log(`  id=${l1.id} inserted=${l1.inserted} | id=${l2.id} inserted=${l2.inserted} | re-save id=${l1again.id} inserted=${l1again.inserted} (no duplica)`);

const provider = new OllamaProvider();
const registry = new ToolRegistry()
  .register(createSearchTool())
  .register(createWebsiteTool())
  .register(createQualifyTool(criteria))
  .register(createSaveLeadTool(store));
const agent = new Agent(provider, registry, { maxTurns: 5, verbose: true, criteria });

const goal =
  process.argv.slice(2).join(' ').trim() ||
  'Buscá UNA agencia de diseño web en Buenos Aires. Abrí el sitio del PRIMER resultado con fetch_page, calificalo con qualify_lead y, si da sí o quizás, guardalo enseguida con save_lead y respondé.';

console.log('');
console.log(`(2) Agente completo con save_lead\nobjetivo: ${goal}\n`);

const result = await agent.run(goal);
console.log('');
console.log(`--- respuesta del agente (${result.turns} turno(s)) ---`);
console.log(result.answer);

// Persistimos también la ejecución (historial de runs)
const runId = store.saveRun({ goal, answer: result.answer, turns: result.turns });

console.log('');
console.log(`(3) Estado guardado (run id=${runId})`);
console.log(`  leads en db: ${store.countLeads()}`);
for (const lead of store.listLeads()) {
  console.log(`  [${lead.id}] ${lead.result.toUpperCase()} ${lead.score}/100 - ${lead.name} (${lead.url})`);
}
if (store.listRuns().length) {
  const last = store.listRuns(1)[0];
  console.log(`  última ejecución: #${last.id} ${last.turns} turnos - "${last.goal.slice(0, 60)}..."`);
}

store.close();