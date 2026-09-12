import type { SearchProvider, SearchResult } from './types.js';

const BING_RSS = 'https://www.bing.com/search?format=rss&q=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeEntities(m[1]) : '';
}

export function parseBingRss(xml: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRegex.exec(xml)) !== null && results.length < limit) {
    const block = m[1];
    const title = extractTag(block, 'title');
    const url = extractTag(block, 'link');
    const snippet = extractTag(block, 'description');
    if (title && url) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}

export class BingRssProvider implements SearchProvider {
  readonly name = 'bing-rss';

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = `${BING_RSS}${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) {
      throw new Error(`Bing RSS respondió ${res.status}`);
    }

    const xml = await res.text();
    return parseBingRss(xml, limit);
  }
}