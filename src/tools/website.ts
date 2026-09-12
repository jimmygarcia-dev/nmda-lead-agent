import type { Tool } from '../core/types.js';

const DEFAULT_MAX_CHARS = 8000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_LINKS = 12;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface PageExtract {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  truncated: boolean;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '\u2014');
}

/** Convierte HTML a texto plano legible: saca scripts/estilos y colapsa espacios. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<template[\s\S]*?<\/template>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' '),
  )
    .replace(/<\/?(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

export function extractDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

export function extractLinks(html: string, base: string, limit = MAX_LINKS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    try {
      const abs = new URL(m[1], base).href;
      if (/^https?:$/.test(new URL(abs).protocol) && !seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    } catch {
      // href inválido, se ignora
    }
  }
  return out;
}

function sniffCharset(buf: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 1024)).toLowerCase();
  const m = head.match(/charset=["']?([a-z0-9_-]+)/i);
  return m ? m[1] : 'utf-8';
}

function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const cut = text.slice(0, maxChars);
  const space = cut.lastIndexOf(' ');
  return { text: (space > maxChars * 0.6 ? cut.slice(0, space) : cut) + '...', truncated: true };
}

export async function fetchPage(url: string, maxChars = DEFAULT_MAX_CHARS): Promise<PageExtract> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isHtml =
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml') ||
    contentType.includes('text/plain');
  if (!isHtml) {
    throw new Error(`El tipo de contenido no es HTML: ${contentType || 'desconocido'}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  let charset = sniffCharset(buf);
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buf);
  } catch {
    charset = 'utf-8';
    html = new TextDecoder('utf-8').decode(buf);
  }

  const finalUrl = res.url || url;
  const title = extractTitle(html);
  const description = extractDescription(html);
  const links = extractLinks(html, finalUrl);
  const { text, truncated } = truncate(htmlToText(html), Math.max(500, maxChars));

  return { url: finalUrl, title, description, text, links, truncated };
}

export function createWebsiteTool(): Tool {
  return {
    name: 'fetch_page',
    description:
      'Abre una página web y extrae su texto legible: título, descripción, cuerpo y links. ' +
      'Usalo para leer el contenido de un resultado de búsqueda y analizarlo.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL de la página a leer.' },
        max_chars: {
          type: 'number',
          description: 'Máximo de caracteres de texto a devolver (500-20000, default 8000).',
        },
      },
      required: ['url'],
    },
    async execute(args) {
      const rawUrl = typeof args.url === 'string' ? args.url.trim() : '';
      try {
        const url = new URL(rawUrl).href;
        if (!/^https?:$/.test(new URL(url).protocol)) {
          return { error: 'La URL debe empezar con http:// o https://.' };
        }
        const maxCharsRaw = typeof args.max_chars === 'number' ? args.max_chars : DEFAULT_MAX_CHARS;
        const maxChars = Math.max(500, Math.min(20000, Math.floor(maxCharsRaw)));
        return await fetchPage(url, maxChars);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `No se pudo leer la página: ${message}` };
      }
    },
  };
}