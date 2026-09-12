import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { Guardrails } from '../guardrails/guardrails.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true });

console.log('--- PHASE 9: smoke test Guardrails ---');
console.log('');

// (1) Vallas DETERMINISTAS (sin LLM): se prueban solas
console.log('(1) Vallas deterministas (sin LLM, al instante):');

const guards = new Guardrails({
  // Ojo: "espiar" no matchea "Espiá" (tilde + conjugación). Por eso usamos
  // raíces: cualquier palabra que EMPIECE con "espi"/"hacke" queda bloqueada.
  blockedGoalPatterns: [/\bespi/i, /\bhacke/i, /\bilega/i],
  blockedToolNames: ['save_lead'],
  maxRepeatTool: 2,
  redactPii: true,
});

// 1a) objetivo peligroso -> rechazo sin hablar con el LLM
const goalOk = guards.checkGoal('Buscá agencias de diseño web en Buenos Aires.');
const goalBad = guards.checkGoal('Espiá a la competencia y robá sus clientes.');
console.log(
  `  checkGoal("Buscá agencias...")   -> ${goalOk.allowed ? 'PERMITIDO' : 'DENEGADO'}`,
);
console.log(
  `  checkGoal("Espiá a la competenci") -> ${
    goalBad.allowed ? 'PERMITIDO' : `DENEGADO (${goalBad.reason})`
  }`,
);

// 1b) denylist de tools
const denylistHit = guards.beforeTool('save_lead', { name: 'X' });
console.log(
  `  beforeTool(save_lead) -> ${denylistHit.allowed ? 'PERMITIDO' : `DENEGADO (${denylistHit.reason})`}`,
);
const okTool = guards.beforeTool('search_google', { query: 'q' });
console.log(`  beforeTool(search_google) -> ${okTool.allowed ? 'PERMITIDO' : 'DENEGADO'}`);

// 1c) detección de repetición (misma huella <= maxRepeatTool)
const a1 = guards.beforeTool('fetch_page', { url: 'https://a.com' });
guards.afterTool('fetch_page', { url: 'https://a.com' });
const a2 = guards.beforeTool('fetch_page', { url: 'https://a.com' });
guards.afterTool('fetch_page', { url: 'https://a.com' });
const a3 = guards.beforeTool('fetch_page', { url: 'https://a.com' });
console.log(
  `  fetch_page{a.com} 1ra -> ${a1.allowed ? 'PERMITIDO' : 'DENEGADO'} | 2da -> ${a2.allowed ? 'PERMITIDO' : 'DENEGADO'} | 3ra -> ${a3.allowed ? 'PERMITIDO' : `DENEGADO (${a3.reason})`}`,
);

// 1d) saneado de PII en la respuesta final
const dirty =
  'Contactame a juan@empresa.com.ar o al 11 2345 6789 (DNI 12.345.678).';
console.log(`  checkOutput("${dirty}")`);
console.log(`    -> "${guards.checkOutput(dirty).redacted}"`);
console.log('');

// (2) Corrida REAL con guardrails puestos: presupuesto de 3 llamadas al LLM
//     y la persistencia vetada (save_lead en la denylist).
console.log('(2) Corrida real con guardrails: presupuesto 3 llamadas LLM + save_lead vetado');
console.log('');

const store = new LeadStore(dbPath);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
const provider = new OllamaProvider();

const liveGuards = new Guardrails({
  maxLlmCalls: 3,
  maxRepeatTool: 2,
  blockedToolNames: ['save_lead'],
  redactPii: false,
});

const agent = new Agent(provider, registry, {
  maxTurns: 8,
  verbose: true,
  criteria: defaultCriteria,
  memory,
  guards: liveGuards,
});

const goal =
  'Buscá UNA agencia de diseño web en Buenos Aires, abrí su página con fetch_page, ' +
  'pásale el TEXTO COMPLETO a qualify_lead y guardala con save_lead si da "sí" o "quizás".';

const result = await agent.run(goal);

console.log('');
console.log(`--- respuesta (${result.turns} turno(s)) ---`);
console.log(result.answer);

console.log('');
console.log('--- qué pasó dentro (pasos con incidencias) ---');
for (const step of result.steps) {
  const label =
    step.action.kind === 'tool'
      ? `${step.action.tool}(${JSON.stringify(step.action.args).slice(0, 50)})`
      : 'final';
  const status = step.error ? `ERROR: ${step.error}` : 'ok';
  console.log(`  [#${step.turn}] ${label} ${status}`);
}

console.log('');
console.log(`leads persistidos: ${store.countLeads()} (guardrail vetó save_lead -> debería ser 0)`);

store.close();