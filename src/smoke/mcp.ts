import 'dotenv/config';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { LeadStore } from '../persistence/store.js';
import { AgentMemory } from '../memory/memory.js';
import { buildHostRegistry, defaultCriteria } from '../tools/host.js';
import { McpClient, createRegistryFromMcp } from '../mcp/client.js';
import { McpToolServer } from '../mcp/server.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
rmSync(dbPath, { force: true });

const store = new LeadStore(dbPath);
store.saveLead({
  name: 'Soporte Digital Labs',
  url: 'https://soportedigital.fake',
  location: 'México',
  score: 59,
  result: 'quizás',
  reasons: ['Coincide la ubicación buscada: mexico.'],
  matched: ['diseño web'],
});
store.saveRun({
  goal: 'Auditar agencias (demo MCP)',
  answer: 'Nada guardado todavía.',
  turns: 1,
});
const memory = new AgentMemory(store);

console.log('--- PHASE 6: smoke test MCP ---');
console.log('');

// (1) Servidor MCP "en proceso": le tiramos mensajes JSON-RPC a mano
console.log('(1) Servidor MCP en proceso (protocolo):');
const registryLocal = buildHostRegistry(store, memory);
const localServer = new McpToolServer(registryLocal, { name: 'nmda-tools-local', version: '0.1.0' });
const handshake = await localServer.handleLine(
  JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
);
console.log(`  -> ${handshake}`);
const toolsList = await localServer.handleLine(
  JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
);
console.log(`  tools/list -> ${(JSON.parse(toolsList!).result as { tools: { name: string }[] }).tools.map((t) => t.name).join(', ')}`);
console.log('');

// (2) El agente usa los tools desde un PROCESO EXTERNO via MCP
console.log('(2) Agente con tools servidos por un proceso MCP aparte:');
const serverScript = fileURLToPath(new URL('../mcp/serverHost.ts', import.meta.url));
const client = new McpClient(serverScript);
const hello = await client.initialize();
console.log(`  handshake con servidor externo: ${JSON.stringify(hello.serverInfo)} (protocolo ${hello.protocolVersion})`);

const remoteRegistry = await createRegistryFromMcp(client);
console.log(`  tools remotos disponibles: ${remoteRegistry.list().map((t) => t.name).join(', ')}`);

const directSearch = (await client.callTool('search_google', { query: 'agencia diseño web México', limit: 1 })) as {
  content: { text?: string }[];
};
console.log(`  tools/call directo -> ${directSearch.content[0]?.text?.slice(0, 90)}...`);
console.log('');

const provider = new OllamaProvider();
const agent = new Agent(provider, remoteRegistry, {
  maxTurns: 6,
  verbose: true,
  criteria: defaultCriteria,
  memory,
});

const goal =
  process.argv.slice(2).join(' ').trim() ||
  'Buscá UNA agencia de diseño web en México NUEVA (que no auditaste antes). ' +
    'Revisá la memoria. Tomá el PRIMER resultado nuevo, abri lo con fetch_page, pasale el ' +
    'TEXTO COMPLETO a qualify_lead y si da sí o quizás guardala con save_lead.';

console.log(`objetivo: ${goal}\n`);
const result = await agent.run(goal);

console.log('');
console.log(`--- respuesta del agente (${result.turns} turno(s)) ---`);
console.log(result.answer);
console.log('');
console.log('--- resumen de pasos (tools ejecutados en el servidor MCP) ---');
for (const step of result.steps) {
  const action =
    step.action.kind === 'tool'
      ? `${step.action.tool}(${JSON.stringify(step.action.args)})`
      : 'final: ' + step.action.answer.slice(0, 60);
  const status = step.error ? `ERROR: ${step.error}` : step.result ? 'ok' : '';
  console.log(`  [${step.turn}] ${step.thought} -> ${action} ${status}`.trim());
}

console.log('');
console.log('--- leads persistidos (escritos por el proceso MCP, leídos desde acá) ---');
for (const lead of store.listLeads()) {
  console.log(`  [${lead.id}] ${lead.result.toUpperCase()} ${lead.score}/100 - ${lead.name} (${lead.url})`);
}

client.close();
store.close();