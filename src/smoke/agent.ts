import 'dotenv/config';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { ToolRegistry } from '../tools/registry.js';
import { createSearchTool } from '../search/index.js';

const provider = new OllamaProvider();
const registry = new ToolRegistry().register(createSearchTool());
const agent = new Agent(provider, registry, { maxTurns: 4, verbose: true });

const goal =
  process.argv.slice(2).join(' ').trim() ||
  'Encontrá 2 empresas de diseño web en Buenos Aires, con su página web y un fragmento de qué hacen.';

console.log('--- Milestone 1: agente corriendo ---');
console.log(`modelo: ${provider.modelName}`);
console.log(`tools:  ${registry.list().map((t) => t.name).join(', ')}`);
console.log(`objetivo: ${goal}`);
console.log('');

const result = await agent.run(goal);

console.log('');
console.log(`--- respuesta del agente (${result.turns} turno(s)) ---`);
console.log(result.answer);
console.log('');
console.log('--- resumen de pasos ---');
for (const step of result.steps) {
  const action = step.action.kind === 'tool'
    ? `${step.action.tool}(${JSON.stringify(step.action.args)})`
    : 'final: ' + step.action.answer.slice(0, 60);
  const status = step.error ? `ERROR: ${step.error}` : step.result ? 'ok' : '';
  console.log(`  [${step.turn}] ${step.thought} → ${action} ${status}`.trim());
}