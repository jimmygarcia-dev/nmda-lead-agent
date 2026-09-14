import 'dotenv/config';
import { createRoutedProvider } from '../llm/providerFactory.js';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry } from '../tools/host.js';

const store = new LeadStore(':memory:');
const memory = new AgentMemory(store);
const router = createRoutedProvider();
const registry = buildHostRegistry(store, memory, router);

console.log('--- smoke write_email + value_page (ruta quality, con fallback local) ---');
console.log('');

const text =
  'Buenos Aires IT es una agencia de diseño y desarrollo web con más de 10 años en Argentina. ' +
  'Especializada en sitios institucionales, tiendas e-commerce y landing pages de alto rendimiento. ' +
  'Ofrece posicionamiento SEO, mantenimiento integral y aplicaciones a medida. Equipo propio de ' +
  'diseñadores y desarrolladores. Trabajaron con marcas de retail, gastronomía y servicios ' +
  'profesionales en Buenos Aires y resto del país. Contacto directo con el equipo: presupuestos en ' +
  'menos de 48 horas. Destacan su metodología ágil y reportes de avance semanales. El sitio incluye ' +
  'casos de éxito con métricas concretas (incrementos de conversión y tráfico) y testimonios de clientes.';

// (1) value_page: valoración cualitativa
console.log('(1) value_page:');
const valued = await registry.execute('value_page', {
  name: 'Buenos Aires IT',
  url: 'https://buenosairesit.com/',
  text,
});
const v = valued as Record<string, unknown>;
if (v.error) {
  console.log(`  ERROR: ${v.error}`);
} else {
  const value = (v.value ?? {}) as Record<string, unknown>;
  console.log(`  verdict: ${value.verdict}  score: ${value.score}`);
  console.log(`  fortalezas (${((value.strengths ?? []) as unknown[]).length}):`);
  for (const s of (value.strengths ?? []) as string[]) console.log(`    - ${s}`);
}
console.log('');

// (2) write_email: primer email de contacto
console.log('(2) write_email:');
const emailed = await registry.execute('write_email', {
  name: 'Buenos Aires IT',
  url: 'https://buenosairesit.com/',
  services: ['diseño web', 'e-commerce', 'SEO'],
  score: 76,
  highlights: ['10+ años', 'crecimiento por conversión documentado'],
  your_name: 'Martín',
  your_company: 'NMDA Lead',
});
const e = emailed as Record<string, unknown>;
if (e.error) {
  console.log(`  ERROR: ${e.error as unknown as string}`);
} else {
  const email = (e.email ?? {}) as Record<string, unknown>;
  console.log(`  asunto: ${email.subject}`);
  console.log(`  ---`);
  console.log(`  ${(email.body ?? '').toString().slice(0, 600)}`);
}
console.log('');
console.log('--- fin ---');