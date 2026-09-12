import 'dotenv/config';
import { Agent } from '../core/agent.js';
import { OllamaProvider } from '../llm/OllamaProvider.js';
import { ToolRegistry } from '../tools/registry.js';
import { createSearchTool } from '../search/index.js';
import { createWebsiteTool } from '../tools/website.js';
import { createQualifyTool } from '../tools/qualify.js';
import { qualify } from '../qualification/engine.js';
import type { LeadProfile, QualificationCriteria } from '../qualification/types.js';

const criteria: QualificationCriteria = {
  label: 'Agencia de diseño y desarrollo web en Buenos Aires',
  locations: ['buenos aires', 'caba'],
  industries: ['agencia digital', 'desarrollo de software'],
  services: ['diseño web', 'desarrollo web', 'e-commerce', 'landing pages'],
  keywords: ['seo', 'aplicaciones', 'posicionamiento'],
  minScore: 60,
};

console.log('--- PHASE 3: smoke test qualification ---');
console.log('criterios:', criteria.label);
console.log('');

console.log('(1) Motor determinístico con candidatos de ejemplo:');
const candidates: LeadProfile[] = [
  {
    name: 'Buenos Aires IT',
    url: 'https://buenosairesit.com/',
    location: 'Buenos Aires',
    description:
      'Agencia de diseño web y desarrollo web en Buenos Aires. Creamos sitios, e-commerce, landing pages y aplicaciones con SEO.',
  },
  {
    name: 'Zapatería Don Pepe',
    url: 'https://zapateria-pepe.fake',
    location: 'Córdoba',
    description: 'Venta de calzado urbano y formal al por mayor y menor. Envíos a todo el país.',
  },
];
for (const c of candidates) {
  const v = qualify(c, criteria);
  console.log(`  ${c.name} -> ${v.result.toUpperCase()} (${v.score}/100)`);
  for (const r of v.reasons) console.log(`     - ${r}`);
}
console.log('');

const provider = new OllamaProvider();
const registry = new ToolRegistry()
  .register(createSearchTool())
  .register(createWebsiteTool())
  .register(createQualifyTool(criteria));
const agent = new Agent(provider, registry, { maxTurns: 5, verbose: true, criteria });

const goal =
  process.argv.slice(2).join(' ').trim() ||
  'Buscá una agencia de diseño web en Buenos Aires. Abrí su sitio con fetch_page, calificala con qualify_lead y decime si es un lead calificado y por qué.';

console.log(`(2) Agente completo\nobjetivo: ${goal}\n`);
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