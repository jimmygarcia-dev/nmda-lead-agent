import type { AgentMemory } from '../memory/memory.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { LeadStore } from '../persistence/store.js';
import type { QualificationCriteria } from '../qualification/types.js';
import { createSearchTool } from '../search/index.js';
import { createQualifyTool } from './qualify.js';
import { createRecallMemoryTool } from './recall.js';
import { createSaveLeadTool } from './saveLead.js';
import { ToolRegistry } from './registry.js';
import { createValuePageTool } from './valuePage.js';
import { createWebsiteTool } from './website.js';
import { createWriteEmailTool } from './writeEmail.js';

export const defaultCriteria: QualificationCriteria = {
  label: 'Agencia de diseño y desarrollo web en Buenos Aires',
  locations: ['buenos aires', 'caba'],
  industries: ['agencia digital', 'desarrollo de software'],
  services: ['diseño web', 'desarrollo web', 'e-commerce', 'landing pages'],
  keywords: ['seo', 'aplicaciones', 'posicionamiento'],
  minScore: 60,
};

/**
 * Construye el set de tools "host" (search + website + qualify + persist + memory).
 * Si se pasa un LLMProvider, también registra los tools LLM (write_email y
 * value_page); pasándole el LLMRouter, esos usan la ruta de calidad
 * (DeepSeek si hay key, modelo local como fallback).
 */
export function buildHostRegistry(
  store: LeadStore,
  memory: AgentMemory,
  llm?: LLMProvider,
): ToolRegistry {
  const registry = new ToolRegistry()
    .register(createSearchTool())
    .register(createWebsiteTool())
    .register(createQualifyTool(defaultCriteria))
    .register(createSaveLeadTool(store))
    .register(createRecallMemoryTool(memory));
  if (llm) {
    registry.register(createWriteEmailTool(llm)).register(createValuePageTool(llm));
  }
  return registry;
}