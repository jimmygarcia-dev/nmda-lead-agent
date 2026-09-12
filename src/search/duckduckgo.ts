import type { SearchProvider, SearchResult } from './types.js';

const DDG_HTML = 'https://html.duckduckgo.com/html/?q=';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0';

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

function decodeRedirectUrl(href: string): string {
  const clean = href.replace(/&amp;/g, '&');
  const m = clean.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('/') || decoded.startsWith('http')) return decoded;
    } catch {
      // continuar con el fallback
    }
  }
  return clean;
}

export function parseDuckDuckGo(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  interface Hit {
    url: string;
    title: string;
    pos: number;
  }
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    hits.push({ url: decodeRedirectUrl(m[1]), title: stripTags(m[2]), pos: m.index });
  }

  for (let i = 0; i < hits.length && results.length < limit; i++) {
    const hit = hits[i];
    if (!hit.title || !hit.url.startsWith('http') || seen.has(hit.url)) continue;
    seen.add(hit.url);
    const next = i + 1 < hits.length ? hits[i + 1].pos : html.length;
    const segment = html.slice(hit.pos, next);
    const snip = segment.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    results.push({
      title: hit.title,
      url: hit.url,
      snippet: snip ? stripTags(snip[1]) : '',
    });
  }
  return results;
}

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = 'duckduckgo';

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = `${DDG_HTML}${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo respondió ${res.status}`);
    }

    const html = await res.text();
    return parseDuckDuckGo(html, limit);
  }
}