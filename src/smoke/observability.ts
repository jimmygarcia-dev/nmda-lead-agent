import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { AgentMemory } from '../memory/memory.js';
import { CompositeObserver } from '../observability/composite.js';
import { Metrics } from '../observability/metrics.js';
import { Tracer } from '../observability/tracer.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true });

console.log('--- PHASE 8: smoke test Observabilidad ---');
console.log('');

const store = new LeadStore(dbPath);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
const provider = new OllamaProvider();

const tracer = new Tracer();
const metrics = new Metrics();
const observer = new CompositeObserver(tracer, metrics);

const agent = new Agent(provider, registry, {
  maxTurns: 6,
  verbose: true,
  criteria: defaultCriteria,
  memory,
  observer,
});

const goal =
  'Buscá UNA sola agencia de diseño web en México. Tomá el PRIMER resultado nuevo, ' +
  'abrí su página con fetch_page, pasale el TEXTO COMPLETO a qualify_lead y si da "sí" o ' +
  '"quizás" guardala con save_lead. Después FINALIZÁ (no audites más).';

console.log(`objetivo: ${goal}\n`);
const result = await agent.run(goal);

console.log('');
console.log(`--- respuesta del agente (${result.turns} turno(s)) ---`);
console.log(result.answer);

console.log('');
console.log(tracer.renderTree());

console.log('');
console.log(metrics.renderSummary());

console.log('');
console.log('--- también: los spans como datos (exportables a JSON) ---');
console.log(JSON.stringify(tracer.toJSON().map((s) => ({ kind: s.kind, name: s.name, turn: s.turn, ms: Math.round(s.ms), ok: s.ok })), null, 0));

store.close();