import type { Tool } from '../core/types.js';
import { BingRssProvider } from './bingRss.js';
import { DuckDuckGoProvider } from './duckduckgo.js';
import { FallbackSearchProvider } from './fallback.js';
import type { SearchProvider } from './types.js';

export type { SearchProvider, SearchResult } from './types.js';

/**
 * Capa abstraída de búsqueda sin API de pago.
 * Por defecto intenta duckduckgo, y si devuelve 0 cae a bing-rss.
 * SEARCH_PROVIDER=duckduckgo | bing-rss | duckduckgo+bing-rss (override manual)
 */
export function createSearchProvider(envName = 'SEARCH_PROVIDER'): SearchProvider {
  const name = (process.env[envName] ?? 'duckduckgo').toLowerCase();
  if (name.includes('+')) {
    const parts = name.split('+').map((n) => providerByName(n.trim()));
    return new FallbackSearchProvider(parts);
  }
  const primary = providerByName(name);
  const fallbacks: SearchProvider[] = [];
  if (name === 'duckduckgo') fallbacks.push(new BingRssProvider());
  if (name === 'bing-rss') fallbacks.push(new DuckDuckGoProvider());
  return fallbacks.length > 0 ? new FallbackSearchProvider([primary, ...fallbacks]) : primary;
}

function providerByName(name: string): SearchProvider {
  switch (name) {
    case 'bing':
    case 'bing-rss':
      return new BingRssProvider();
    case 'duckduckgo':
      return new DuckDuckGoProvider();
    default:
      throw new Error(`Provider desconocido: ${name}`);
  }
}

let cachedTool: Tool | undefined;

export function createSearchTool(provider?: SearchProvider): Tool {
  if (provider) return buildTool(provider);
  if (!cachedTool) {
    cachedTool = buildTool(createSearchProvider());
  }
  return cachedTool;
}

function buildTool(provider: SearchProvider): Tool {
  return {
    name: 'search_google',
    description:
      `Busca en la web (${provider.name}) una consulta y devuelve los resultados más relevantes ` +
      'con título, URL y fragmento. Usalo para encontrar empresas, contactos o información.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Consulta de búsqueda.' },
        limit: { type: 'number', description: 'Cantidad máxima de resultados (1-10, default 5).' },
      },
      required: ['query'],
    },
    async execute(args) {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) {
        return { error: 'query vacío: necesitás indicar qué buscar.' };
      }
      const limitRaw = typeof args.limit === 'number' ? args.limit : 5;
      const limit = Math.max(1, Math.min(10, Math.floor(limitRaw)));
      try {
        const results = await provider.search(query, limit);
        return { query, results };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `La búsqueda falló: ${message}` };
      }
    },
  };
}