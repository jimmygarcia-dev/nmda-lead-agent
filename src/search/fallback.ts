import type { SearchProvider, SearchResult } from './types.js';

export class FallbackSearchProvider implements SearchProvider {
  readonly name: string;
  private providers: SearchProvider[];
  private tried = 0;

  constructor(providers: SearchProvider[]) {
    if (providers.length === 0) throw new Error('FallbackSearchProvider necesita al menos un provider');
    this.providers = providers;
    this.name = providers.map((p) => p.name).join('+');
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    for (let i = 0; i < this.providers.length; i++) {
      try {
        const results = await this.providers[i].search(query, limit);
        if (results.length > 0) return results;
      } catch {
        // continuar con el siguiente
      }
    }
    return [];
  }
}
