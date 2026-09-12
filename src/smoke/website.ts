import 'dotenv/config';
import { fetchPage } from '../tools/website.js';

const url = process.argv.slice(2)[0]?.trim() || 'https://example.com';
const maxChars = Number(process.argv.slice(2)[1]) || 2500;

console.log('--- PHASE 2: smoke test website (fetch_page) ---');
console.log(`url:  ${url}`);
console.log(`max_chars: ${maxChars}`);
console.log('');

const page = await fetchPage(url, maxChars);

console.log(`título:      ${page.title || '(sin título)'}`);
console.log(`descripción: ${page.description || '(sin descripción)'}`);
console.log(`truncado:    ${page.truncated ? 'sí' : 'no'}`);
console.log('texto:');
console.log(page.text);
console.log('');
console.log('links (primeros 5):');
for (const link of page.links.slice(0, 5)) console.log(`  - ${link}`);