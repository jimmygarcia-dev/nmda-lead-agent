import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Tool } from '../core/types.js';
import type { LeadStore, StoredLeadRow } from '../persistence/store.js';

const MAX_ROWS = 10000;
const DEFAULT_FILE = 'data/leads-export.csv';

function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

function rowToCsv(row: StoredLeadRow): string {
  return [
    row.id,
    row.name,
    row.url,
    row.location ?? '',
    row.score,
    row.result,
    row.reasons.join('; '),
    row.matched.join('; '),
    row.created_at,
  ]
    .map(csvField)
    .join(',');
}

const COLUMNS = ['id', 'name', 'url', 'location', 'score', 'result', 'reasons', 'matched', 'created_at'];

/**
 * Tool export_leads_csv: vuelca los leads guardados a un CSV en disco.
 * Devuelve confirmación corta (no el contenido completo) para no quemar contexto.
 */
export function createExportLeadsTool(store: LeadStore): Tool {
  return {
    name: 'export_leads_csv',
    description:
      'Exporta los leads guardados en la base a un archivo CSV ' +
      `(default "${DEFAULT_FILE}"). Usalo cuando el usuario pida "los datos en CSV", ` +
      '"una planilla", "exportame los leads" o quiera descargar los resultados. ' +
      'Opcionalmente filtra por resultado (sí/no/quizás). Devuelve solo un resumen ' +
      'corto (ruta del archivo y cantidad), no el contenido completo. ' +
      'El archivo se abre bien en Excel (UTF-8 con BOM).',
    parameters: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          enum: ['sí', 'no', 'quizás'],
          description: 'Filtro opcional: exportar solo leads con ese veredicto.',
        },
        file: {
          type: 'string',
          description: `Ruta de salida del CSV (default "${DEFAULT_FILE}").`,
        },
      },
    },

    execute(args) {
      const rawResult = typeof args.result === 'string' ? args.result.trim() : '';
      const filter = ['sí', 'no', 'quizás'].includes(rawResult) ? rawResult : undefined;
      const file = typeof args.file === 'string' && args.file.trim()
        ? args.file.trim()
        : DEFAULT_FILE;

      const rows = store.listLeads(MAX_ROWS);
      const filtered = filter ? rows.filter((r) => r.result === filter) : rows;

      if (filtered.length === 0) {
        return {
          exported: 0,
          file,
          message: filter
            ? `No hay leads guardados con resultado "${filter}" para exportar.`
            : 'No hay leads guardados para exportar.',
        };
      }

      const csv = [COLUMNS.join(','), ...filtered.map(rowToCsv)].join('\n');
      const target = resolve(file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '\uFEFF' + csv, 'utf8');

      return {
        exported: filtered.length,
        file: target,
        message: `Exporté ${filtered.length} lead(s) a ${target}` + (filter ? ` (resultado "${filter}")` : ''),
      };
    },
  };
}