import type { Tool } from '../core/types.js';
import { qualify } from '../qualification/engine.js';
import type { QualificationCriteria } from '../qualification/types.js';

export function createQualifyTool(criteria: QualificationCriteria): Tool {
  return {
    name: 'qualify_lead',
    description:
      `Califica a un candidato contra los criterios vigentes (${criteria.label}) y devuelve ` +
      'veredicto (sí/no/quizás), puntaje de 0 a 100 y motivos. ' +
      'Pasale los datos de la empresa (nombre, url, ubicación si se conoce y el CONTENIDO ' +
      'COMPLETO de su sitio que devolvió fetch_page). Evitá resumir: el puntaje depende del texto.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la empresa.' },
        url: { type: 'string', description: 'URL de la empresa.' },
        location: { type: 'string', description: 'Ubicación, si se conoce.' },
        description: {
          type: 'string',
          description: 'Texto completo del sitio (o snippet) de la empresa. Cuanto más texto, más preciso el puntaje.',
        },
      },
      required: ['name', 'description'],
    },
    execute(args) {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const description = typeof args.description === 'string' ? args.description.trim() : '';
      if (!name || !description) {
        return { error: 'Faltan name o description para calificar.' };
      }
      const profile = {
        name,
        url: typeof args.url === 'string' ? args.url.trim() : '',
        location: typeof args.location === 'string' ? args.location.trim() : undefined,
        description,
      };
      const verdict = qualify(profile, criteria);
      return { profile, verdict };
    },
  };
}