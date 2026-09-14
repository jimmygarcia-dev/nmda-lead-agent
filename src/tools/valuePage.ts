import type { Tool } from '../core/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { ROUTE_QUALITY } from '../llm/LLMRouter.js';
import { ensureObject, safeJsonParse } from '../util/json.js';

/**
 * Tool value_page: valoración cualitativa (LLM) de un sitio como candidato a
 * lead: qué tan sólido se ve, fortalezas, debilidades y signal/fit.
 * Usa el proveedor de calidad (route quality); sin él, cae al modelo local.
 */
export function createValuePageTool(provider: LLMProvider): Tool {
  const schema = {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['strong', 'medium', 'weak'],
        description: 'Qué tan sólido se ve el candidato.',
      },
      score: { type: 'number', description: 'Comodidad/huella percibida 0-100.' },
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      fit_signals: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict', 'score', 'strengths', 'weaknesses'],
  };

  return {
    name: 'value_page',
    description:
      'Analiza el texto de una página y devuelve una valoración cualitativa del candidato ' +
      'como lead: verdict (strong/medium/weak), score, fortalezas, debilidades y señales de fit. ' +
      'Usálo con el texto COMPLETO de fetch_page para complementar el puntaje de qualify_lead.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la empresa.' },
        url: { type: 'string', description: 'URL del sitio.' },
        text: { type: 'string', description: 'Texto completo de la página (de fetch_page).' },
      },
      required: ['name', 'text'],
    },

    async execute(args) {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const text = typeof args.text === 'string' ? args.text.trim() : '';
      const url = typeof args.url === 'string' ? args.url.trim() : '';
      if (!name || !text) {
        return { error: 'Faltan datos obligatorios: name y text (texto de fetch_page).' };
      }
      if (text.length < 300) {
        return { error: 'El texto es muy corto para valorar (mínimo ~300 caracteres).' };
      }

      const user = [
        `Empresa: ${name}`,
        url ? `Sitio: ${url}` : undefined,
        '--- Texto de la página ---',
        text.slice(0, 6000),
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n');

      const system =
        'Sos un analista de leads B2B. Valorá la solidez del candidato a partir del texto de su ' +
        'sitio: ¿parece una empresa real y activa? ¿transmite especialización en servicios? ' +
        'No digas lo que no se puede inferir del texto (no inventes). ' +
        'Devolvé SOLO JSON: {"verdict":"strong|medium|weak","score":0-100,' +
        '"strengths":[...],"weaknesses":[...],"fit_signals":[...]}, sin texto fuera del JSON.';

      try {
        const res = await provider.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { jsonSchema: schema, route: ROUTE_QUALITY, temperature: 0 },
        );
        const parsed = ensureObject(safeJsonParse(res.content));
        return { value: parsed };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `No se pudo valorar la página: ${message}` };
      }
    },
  };
}