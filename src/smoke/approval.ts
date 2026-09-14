import 'dotenv/config';
import { rmSync } from 'node:fs';
import { Agent } from '../core/agent.js';
import { ConsoleApprover } from '../approval/consoleApprover.js';
import type { HumanApprover } from '../approval/types.js';
import { Guardrails } from '../guardrails/guardrails.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const dbPath = 'data/approval.db';
rmSync(dbPath, { force: true });

console.log('--- PHASE 10: smoke test Aprobación Humana ---');
console.log('');

// (1) Cómo se ve el pedido de aprobación (sin esperar stdin)
console.log('(1) El prompt que vería un humano:');
const consoleApprover = new ConsoleApprover();
console.log(
  consoleApprover.renderPrompt({
    goal: 'Auditar agencias (demo)',
    turn: 5,
    tool: 'save_lead',
    args: { name: 'México IT', score: 84 },
  }),
);
console.log('');

// (2) Dos corridas cortas y deterministas para mostrar AMBOS brazos del
//     aprobador humano sin depender del humor del modelo.
console.log('(2) El humano pone el freno de mano, y después deja pasar:');
console.log('');

const store = new LeadStore(dbPath);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
const provider = new OllamaProvider();

const runWithDecisions = async (label: string, decisions: Array<{ approved: boolean; note?: string }>) => {
  console.log(`  >>> ${label}`);
  let decisionIndex = 0;
  const approver: HumanApprover = {
    async request(ctx) {
      const decision = decisions[Math.min(decisionIndex, decisions.length - 1)];
      decisionIndex++;
      console.log(
        `      HUMANO sobre ${ctx.tool}: ${decision.approved ? 'APRUEBO' : 'RECHAZO'}${decision.note ? ` (${decision.note})` : ''}`,
      );
      return decision;
    },
  };

  const agent = new Agent(provider, registry, {
    maxTurns: 3,
    verbose: false,
    criteria: defaultCriteria,
    memory,
    approval: { approver, requiredTools: ['save_lead'] },
    guards: new Guardrails({ maxLlmCalls: 4 }),
  });

  // Para que la demo no dependa de si el modelo decide auditar o no, el objetivo
  // pide guardar DIRECTAMENTE una agencia ya "calificada": así el save_lead
  // (y por lo tanto la aprobación humana) se ejercita sí o sí.
  const goal =
    'Simulá que ya calificaste a la agencia "México IT" (url https://buenosairesit.com/, ' +
    'score 76, resultado "sí"). Guardala llamando a save_lead y después FINALIZÁ.';

  const result = await agent.run(goal);
  console.log('');

  for (const step of result.steps) {
    const tool = step.action.kind === 'tool' ? step.action.tool : 'final';
    if (step.error) console.log(`      [#${step.turn}] ${tool} ERROR: ${step.error.slice(0, 70)}`);
  }
  const leads = store.countLeads();
  console.log(`      leads persistidos: ${leads}`);
  return leads;
};

// 2a — el humano RECHAZA: no se persiste, el agente lo acepta y termina
const afterReject = await runWithDecisions('(2a) RECHAZO del humano', [
  { approved: false, note: 'esta agencia no me convence' },
]);
console.log('');

// 2b — el humano APRUEBA: se persiste
const afterApprove = await runWithDecisions('(2b) APROBACIÓN del humano', [
  { approved: true, note: 'ok, adelante' },
]);

console.log('');
console.log(
  `resumen: tras rechazo ${afterReject} lead; tras aprobación ${afterApprove} leads.`,
);
console.log(afterReject === 0 && afterApprove === 1 ? '  (ambos brazos OK)' : '  (revisar: no se llegó al save_lead)');
store.close();