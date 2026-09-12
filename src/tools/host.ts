import type { AgentMemory } from '../memory/memory.js';
import type { LeadStore } from '../persistence/store.js';
import type { QualificationCriteria } from '../qualification/types.js';
import { createSearchTool } from '../search/index.js';
import { createQualifyTool } from './qualify.js';
import { createRecallMemoryTool } from './recall.js';
import { ToolRegistry } from './registry.js';
import { createSaveLeadTool } from './saveLead.js';
import { createWebsiteTool } from './website.js';

export const defaultCriteria: QualificationCriteria = {
  label: 'Agencia de diseño y desarrollo web en Buenos Aires',
  locations: ['buenos aires', 'caba'],
  industries: ['agencia digital', 'desarrollo de software'],
  services: ['diseño web', 'desarrollo web', 'e-commerce', 'landing pages'],
  keywords: ['seo', 'aplicaciones', 'posicionamiento'],
  minScore: 60,
};

/** Construye el set de tools "host" (search + website + qualify + persist + memory). */
export function buildHostRegistry(store: LeadStore, memory: AgentMemory): ToolRegistry {
  return new ToolRegistry()
    .register(createSearchTool())
    .register(createWebsiteTool())
    .register(createQualifyTool(defaultCriteria))
    .register(createSaveLeadTool(store))
    .register(createRecallMemoryTool(memory));
}