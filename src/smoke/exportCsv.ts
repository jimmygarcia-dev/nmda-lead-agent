import 'dotenv/config';
import { rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LeadStore } from '../persistence/store.js';
import { createExportLeadsTool } from '../tools/exportCsv.js';

const out = resolve('data/smoke-export.csv');
rmSync(out, { force: true });

const store = new LeadStore(':memory:');
const byUrl = (name: string) => ({
  name,
  url: `https://${name.toLowerCase().replaceAll(' ', '-')}.fake`,
  location: 'México',
  score: 80,
  result: 'sí',
  reasons: ['Agencia digital', 'Diseño web'],
  matched: ['mexico', 'diseño web'],
});
store.saveLead({ ...byUrl('Agencia Móvil'), location: 'CDMX', score: 85, result: 'sí', reasons: ['Diseño web, e-commerce'] });
store.saveLead({ ...byUrl('Estudio Pixel'), location: 'Guadalajara', score: 45, result: 'no', reasons: ['Cero señales', 'Calle "López"' ] });

const tool = createExportLeadsTool(store);

type ExportResult = { exported: number; file: string; message: string };
const run = async (args: Record<string, unknown>) =>
  (await tool.execute(args)) as unknown as ExportResult;

console.log('--- smoke export_leads_csv ---');
console.log('');

const all = await run({});
console.log('(1) export sin filtro:');
console.log(`  ${all.message}  exported=${all.exported}`);
const csvAll = readFileSync(all.file, 'utf8');
const lines = csvAll.replace(/^\uFEFF/, '').trim().split('\n');
console.log(`  ${lines.length} líneas (1 header + datos). Línea 2: ${lines[1]}`);
console.log('');
if (csvAll.includes('"Calle ""López"""')) console.log('  escape de comillas OK');
else console.log('  (sin caso de comillas dobles en este set)');

const filt = await run({ result: 'sí' });
console.log('');
console.log('(2) filter result=sí:');
console.log(`  ${filt.message}  exported=${filt.exported}`);
console.log('');

const sinDatos = await run({ result: 'quizás' });
console.log('(3) filter sin datos (quizás):');
console.log(`  exported=${sinDatos.exported} | ${sinDatos.message}`);
console.log('');

const f = filt.exported === 1;
const c = all.exported === 2 && lines.length === 3;
console.log(f && c && sinDatos.exported === 0 ? 'VERDE: export y filtros OK' : 'ROJO: revisar');
rmSync(all.file, { force: true });
rmSync(out, { force: true });
store.close();