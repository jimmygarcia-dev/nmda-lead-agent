import type { SearchProvider, SearchResult } from './types.js';

const SERPER_URL = 'https://google.serper.dev/search';

interface SerperOrganicItem {
  title: string;
  link: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperOrganicItem[];
  error?: string;
}

export class SerperProvider implements SearchProvider {
  readonly name = 'serper';
  private readonly gl: string;

  constructor(
    private readonly apiKey: string = process.env.SERPER_API_KEY ?? '',
  ) {
    this.gl = process.env.SERPER_GL ?? 'mx';
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error('Falta SERPER_API_KEY en el .env (https://serper.dev)');
    }
    const res = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: this.gl, hl: 'es', num: Math.min(limit, 10) }),
    });

    if (!res.ok) {
      throw new Error(`Serper respondió ${res.status}`);
    }

    const data = (await res.json()) as SerperResponse;
    if (data.error) {
      throw new Error(`Serper: ${data.error}`);
    }

    const results: SearchResult[] = [];
    for (const item of data.organic ?? []) {
      if (!item.title || !item.link) continue;
      results.push({ title: item.title, url: item.link, snippet: item.snippet ?? '' });
      if (results.length >= limit) break;
    }
    return results;
  }
}