import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { cronNext, parseCron } from '../scheduler/cron.js';
import { JobStore } from '../scheduler/jobStore.js';
import { createAgentJobRunner } from '../scheduler/runner.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true });

console.log('--- PHASE 7: smoke test Scheduler ---');
console.log('');

// (0) Concepto cron: que nos diga la próxima ejecución sin correr nada
console.log('(0) Cron mínimo: la próxima vez de "0 9 * * 1" (lunes 09:00)');
const sample = parseCron('0 9 * * 1');
console.log(`  próxima ejecución -> ${cronNext(sample, new Date()).toString()}`);
console.log('');

// (1) Scheduler con runner FAKE: el mecanismo, sin red ni LLM
console.log('(1) El reloj (runner fake, sin red):');
const jobStore = new JobStore(dbPath);
const fakeJob = jobStore.createJob({
  schedule: '* * * * *', // todos los minutos
  goal: 'emitir latido del reloj',
});
let fakeRuns = 0;
const fakeScheduler = new Scheduler(
  jobStore,
  async () => {
    fakeRuns++;
    return { answer: 'latido emitido', turns: 1 };
  },
  500,
);
const t0 = new Date();
await fakeScheduler.tick(t0);
console.log(`  tick #1 -> ejecuciones: ${fakeRuns} (debería ser 1)`);
await fakeScheduler.tick(t0);
console.log(`  tick #2 (mismo minuto) -> ejecuciones: ${fakeRuns} (debería seguir en 1, no duplica)`);
jobStore.setEnabled(fakeJob.id, false);
console.log('  job fake deshabilitado para la prueba real.');
fakeScheduler.stop();
console.log('');

// (2) Scheduler REAL: un job que dispara al AGENTE completo
console.log('(2) El trabajo (un job real que corre al agente):');
const store = new LeadStore(dbPath);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
const provider = new OllamaProvider();

const runner = createAgentJobRunner({
  provider,
  registry,
  criteria: defaultCriteria,
  memory,
  maxTurns: 5,
  verbose: true,
  buildAgent: ({ provider, registry, criteria, memory, maxTurns, verbose }) =>
    new Agent(provider, registry, { maxTurns, criteria, memory, verbose }),
});

// Cron que vence en el minuto actual: así la demo no espera 60 segundos
const now = new Date();
const minuteCron = `${String(now.getMinutes()).padStart(2, '0')} * * * *`;

const realJob = jobStore.createJob({
  schedule: minuteCron,
  goal:
    'Buscá UNA sola agencia de diseño web en Buenos Aires NUEVA y calificala. ' +
    'Tomá el PRIMER resultado nuevo, abrí su página con fetch_page, pasale ' +
    'el TEXTO COMPLETO a qualify_lead y si da "sí" o "quizás" guardala con save_lead. ' +
    'Después de guardar (o si no califica), FINALIZÁ con tu conclusión: no audites más agencias.',
});

console.log(`  job creado con cron "${minuteCron}" (vence este minuto).`);
const realScheduler = new Scheduler(jobStore, runner, 1_000);
console.log('');
await realScheduler.tick();
realScheduler.stop();

console.log('');
console.log('--- estado de jobs en SQLite ---');
for (const job of jobStore.listJobs()) {
  const last = job.lastResult
    ? `resultado: ${job.lastResult.slice(0, 70)}`
    : job.lastError
      ? `ERROR: ${job.lastError.slice(0, 70)}`
      : 'aún sin correr';
  console.log(`  [#${job.id}] ${job.enabled ? 'HABILITADO' : 'deshabilitado'} "${job.goal.slice(0, 40)}..."`);
  console.log(`       cron ${job.schedule} | último: ${last}`);
}

console.log('');
console.log('--- leads persistidos después del job ---');
for (const lead of store.listLeads()) {
  console.log(`  [${lead.id}] ${lead.result.toUpperCase()} ${lead.score}/100 - ${lead.name} (${lead.url})`);
}

store.close();
jobStore.close();