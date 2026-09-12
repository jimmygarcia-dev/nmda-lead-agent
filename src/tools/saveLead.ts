import type { Tool } from '../core/types.js';
import type { LeadStore } from '../persistence/store.js';

export function createSaveLeadTool(store: LeadStore): Tool {
  return {
    name: 'save_lead',
    description:
      'Guarda un lead calificado en la base de datos SQLite. Pasá los datos del veredicto de ' +
      'qualify_lead: name, url, score, result (sí/no/quizás), location y motivos. ' +
      'Devuelve el id guardado y si fue una inserción nueva o ya existía.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la empresa.' },
        url: { type: 'string', description: 'URL de la empresa.' },
        location: { type: 'string', description: 'Ubicación, si se conoce.' },
        score: { type: 'number', description: 'Puntaje de qualification (0-100).' },
        result: {
          type: 'string',
          enum: ['sí', 'no', 'quizás'],
          description: 'Veredicto de qualify_lead.',
        },
        reasons: {
          type: 'array',
          items: { type: 'string' },
          description: 'Motivos del veredicto.',
        },
      },
      required: ['name', 'url', 'score', 'result'],
    },
    execute(args) {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const url = typeof args.url === 'string' ? args.url.trim() : '';
      const score = typeof args.score === 'number' ? Math.round(args.score) : NaN;
      const result = typeof args.result === 'string' ? args.result.trim() : '';

      if (!name || !url || Number.isNaN(score) || !result) {
        return { error: 'Faltan datos obligatorios: name, url, score y result.' };
      }

      const saved = store.saveLead({
        name,
        url,
        location: typeof args.location === 'string' ? args.location.trim() : undefined,
        score,
        result,
        reasons: Array.isArray(args.reasons) ? args.reasons.map(String) : [],
        matched: [],
      });

      return { saved: { ...saved, message: `Lead guardado con id ${saved.id}` } };
    },
  };
}