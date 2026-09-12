import 'dotenv/config';
import readline from 'node:readline';
import { Agent } from '../core/agent.js';
import { ConsoleApprover } from '../approval/consoleApprover.js';
import type { ApprovalGate, ApprovalDecision } from '../approval/types.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const DB_PATH = process.env.NMDA_DB ?? 'data/cli.db';
const REQUIRE_APPROVAL = process.env.NMDA_APPROVAL === '1';
const MAX_TURNS = Number(process.env.NMDA_MAX_TURNS ?? 10);

const store = new LeadStore(DB_PATH);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
const provider = new OllamaProvider();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let busy = false;
let wantClose = false;

/** La misma readline del REPL atiende también las aprobaciones (evita choques de streams). */
const approval: ApprovalGate | undefined = REQUIRE_APPROVAL
  ? {
      requiredTools: ['save_lead'],
      approver: {
        async request(ctx) {
          const consoleApprover = new ConsoleApprover();
          const answer = await new Promise<string>((resolve) => {
            console.log(consoleApprover.renderPrompt(ctx));
            rl.question('¿apruebo la ejecución? (s/N): ', resolve);
          });
          const trimmed = answer.trim();
          const decision: ApprovalDecision = {
            approved: /^(s|si|sí|y|yes)$/i.test(trimmed),
            note: trimmed || 'no',
          };
          console.log(`  >>> ${decision.approved ? 'APROBADO' : 'RECHAZADO'}`);
          return decision;
        },
      },
    }
  : undefined;

const agent = new Agent(provider, registry, {
  maxTurns: MAX_TURNS,
  verbose: false,
  criteria: defaultCriteria,
  memory,
  approval,
  onStep: (step) => {
    if (step.action.kind !== 'tool') return;
    const label = `[turno ${step.turn}] ${step.action.tool}(${summarize(step.action.args)})`;
    if (step.error) {
      console.log(`  ${label}  --  ${step.error.slice(0, 120)}`);
    } else if (step.result !== undefined) {
      console.log(`  ${label}`);
      console.log(`     → ${summarize(step.result, 140)}`);
    }
  },
});

function summarize(value: unknown, max = 100): string {
  try {
    const text = JSON.stringify(value, null, 0);
    return text.length > max ? text.slice(0, max) + '…' : text;
  } catch {
    return String(value);
  }
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function isExit(input: string): boolean {
  return /^(salir|exit|quit|chau|:q|done)$/i.test(input.trim());
}

function printLeads(): void {
  const leads = store.listLeads();
  if (leads.length === 0) {
    console.log('  (no hay leads guardados)');
    return;
  }
  for (const lead of leads) {
    console.log(
      `  #${lead.id} ${lead.name} — score ${lead.score} (${lead.result}) — ${lead.url}`,
    );
  }
}

function printBanner(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  NMDA Lead Agent — modo interactivo');
  console.log('  modelo: ' + provider.modelName);
  console.log('  tools:  ' + registry.list().map((t) => t.name).join(', '));
  console.log('  base:   ' + DB_PATH + ` (${store.countLeads()} lead(s))`);
  console.log('  aprobación humana: ' + (REQUIRE_APPROVAL ? 'ACTIVA (save_lead pide OK)' : 'desactivada (NMDA_APPROVAL=1 para activarla)'));
  console.log('  comandos: "leads", "ayuda", "salir"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function main(): Promise<void> {
  printBanner();
  console.log('');
  console.log('Espero tu objetivo…');
  console.log('');

  for (;;) {
    if (wantClose) break;
    const goal = (await ask('╭ objetivo\n╰ ')).trim();
    if (goal === '') continue;
    if (isExit(goal)) break;
    if (/^(leads)$/i.test(goal)) {
      printLeads();
      console.log('');
      continue;
    }
    if (/^(ayuda|help)$/i.test(goal)) {
      printBanner();
      continue;
    }

    console.log('');
    console.log('— agente en marcha…');
    busy = true;
    try {
      const result = await agent.run(goal);
      store.saveRun({ goal, answer: result.answer, turns: result.turns });
      console.log('');
      console.log(`— respuesta (${result.turns} turno(s)) —`);
      console.log(result.answer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('');
      console.log(`ERROR: ${message}`);
    } finally {
      busy = false;
    }
    console.log('');
    console.log(`(leads guardados: ${store.countLeads()})`);
    console.log('');
  }

  store.close();
  rl.close();
  console.log('Hasta la próxima.');
  process.exit(0);
}

rl.on('SIGINT', () => {
  console.log('^C');
  wantClose = true;
  if (!busy) rl.close();
});

rl.on('close', () => {
  wantClose = true;
  if (!busy) {
    store.close();
    console.log('Hasta la próxima.');
    process.exit(0);
  }
});

await main();