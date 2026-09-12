import type { Tool } from '../core/types.js';
import type { AgentMemory } from '../memory/memory.js';

export function createRecallMemoryTool(memory: AgentMemory): Tool {
  return {
    name: 'recall_memory',
    description:
      'Devuelve la memoria persistida del agente: ejecuciones previas y leads ya guardados. ' +
      'Usalo antes de calificar o guardar para no repetir trabajo sobre empresas ya auditadas.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: () => memory.recall(),
  };
}