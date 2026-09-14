import 'dotenv/config';
import readline from 'node:readline';
import { Agent } from '../core/agent.js';
import type { AgentResult } from '../core/types.js';
import { ConsoleApprover } from '../approval/consoleApprover.js';
import type { ApprovalGate, ApprovalDecision } from '../approval/types.js';
import { createRoutedProvider } from '../llm/providerFactory.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';

const DB_PATH = process.env.NMDA_DB ?? 'data/cli.db';
const REQUIRE_APPROVAL = process.env.NMDA_APPROVAL === '1';
const MAX_TURNS = Number(process.env.NMDA_MAX_TURNS ?? 10);

const store = new LeadStore(DB_PATH);
const memory = new AgentMemory(store);
const provider = createRoutedProvider();
const registry = buildHostRegistry(store, memory, provider);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let busy = false;
let wantClose = false;
let closed = false;

/** Resumen por vuelta concluida (multi-turno dentro de la sesión). */
const sessionHistory: string[] = [];
const SESSION_CAP = 8;

function summarizeRun(goal: string, result: AgentResult): string {
  const lines: string[] = [];
  lines.push(`* Pedido: ${goal.slice(0, 160)}`);
  let saved = 0;
  for (const step of result.steps) {
    const act = step.action;
    if (act.kind !== 'tool') continue;
    if (step.error) {
      if (act.tool === 'save_lead') lines.push(`  - save_lead falló: ${step.error.slice(0, 100)}`);
      continue;
    }
    if (act.tool === 'save_lead') {
      const r = step.result as { name?: string; result?: string; id?: number };
      saved += 1;
      lines.push(`  - guardó lead: "${r.name ?? ''}" (id ${r.id ?? '?'}, resultado ${r.result ?? '?'})`);
    } else if (act.tool === 'qualify_lead') {
      const r = step.result as { name?: string; result?: string; score?: number };
      lines.push(`  - calificó "${r.name ?? ''}": ${r.result ?? '?'} (score ${r.score ?? '?'})`);
    } else {
      const label = act.tool;
      const url = (step.result as { url?: string })?.url;
      lines.push(`  - usó ${label}${url ? ` (${url})` : ''}`);
    }
  }
  if (saved === 0) lines.push('  - (no se guardó ningún lead)');
  lines.push(`* Respuesta final: ${result.answer.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  return lines.join('');
}

function sessionContext(): string {
  return sessionHistory.join('\n\n');
}

function closeAll(): void {
  if (closed) return;
  closed = true;
  store.close();
  console.log('Hasta la próxima.');
  process.exit(0);
}

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
  console.log(`  provider: ${provider.name} — ${provider.modelName}`);
  if (provider.qualityProvider) {
    console.log(`  ruta calidad (email/valoración): ${provider.qualityProvider.modelName}`);
  } else {
    console.log('  ruta calidad (email/valoración): modelo local (sin DEEPSEEK_API_KEY)');
  }
  console.log('  tools:  ' + registry.list().map((t) => t.name).join(', '));
  console.log('  base:   ' + DB_PATH + ` (${store.countLeads()} lead(s))`);
  console.log('  aprobación humana: ' + (REQUIRE_APPROVAL ? 'ACTIVA (save_lead pide OK)' : 'desactivada (NMDA_APPROVAL=1 para activarla)'));
  console.log('  comandos: "leads", "nuevo" (reset de la sesión), "ayuda", "salir"');
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
    if (/^(nuevo|new|reset)$/i.test(goal)) {
      sessionHistory.length = 0;
      console.log('  (sesión reiniciada: el agente ya no recordará los pedidos anteriores; los leads siguen en la base)');
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
      const result = await agent.run(goal, { sessionContext: sessionContext() });
      sessionHistory.push(summarizeRun(goal, result));
      while (sessionHistory.length > SESSION_CAP) sessionHistory.shift();
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
    console.log(`(leads guardados: ${store.countLeads()} | sesión: ${sessionHistory.length} pedido(s) recordados)`);
    console.log('');
  }

  closeAll();
}

rl.on('SIGINT', () => {
  console.log('^C');
  wantClose = true;
  if (!busy) rl.close();
});

rl.on('close', () => {
  wantClose = true;
  if (!busy) closeAll();
});

await main();