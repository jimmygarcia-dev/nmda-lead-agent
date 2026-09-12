import { createSearchTool } from '../search/index.js';
import type { SearchResult } from '../search/types.js';

export type { SearchResult };

/**
 * Compatibilidad con el nombre histórico del tool: busca usando el provider
 * configurado (DuckDuckGo por defecto).
 */
export async function searchGoogle(query: string, limit = 5): Promise<SearchResult[]> {
  const result = await createSearchTool().execute({ query, limit });
  if (result && Array.isArray(result.results)) {
    return result.results as SearchResult[];
  }
  return [];
}

export { createSearchTool } from '../search/index.js';