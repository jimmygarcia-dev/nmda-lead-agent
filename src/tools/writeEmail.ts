import type { Tool } from '../core/types.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { ROUTE_QUALITY } from '../llm/LLMRouter.js';
import { ensureObject, safeJsonParse } from '../util/json.js';

/**
 * Tool write_email: genera el primer email de contacto (outreach B2B) con el
 * proveedor de calidad (route quality). Sin proveedor de calidad configurado,
 * el router cae al modelo local.
 */
export function createWriteEmailTool(provider: LLMProvider): Tool {
  const schema = {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Asunto del email (máx. 10 palabras).' },
      body: { type: 'string', description: 'Cuerpo del email en español.' },
    },
    required: ['subject', 'body'],
  };

  return {
    name: 'write_email',
    description:
      'Genera un primer email de contacto B2B personalizado para un lead ya calificado, ' +
      'en español y conciso, a partir del nombre, la URL, los servicios y el puntaje del lead. ' +
      'Devuelve JSON con subject y body. NO envía nada; solo redacta.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la empresa del lead.' },
        url: { type: 'string', description: 'URL del sitio del lead.' },
        services: {
          type: 'array',
          items: { type: 'string' },
          description: 'Servicios que ofrece el lead (del análisis del sitio).',
        },
        score: { type: 'number', description: 'Puntaje de qualify_lead (0-100).' },
        highlights: {
          type: 'array',
          items: { type: 'string' },
          description: 'Motivos por los que calificó (por qué nos interesa).',
        },
        your_name: { type: 'string', description: 'Mi nombre (firma). Opcional.' },
        your_company: { type: 'string', description: 'Mi empresa (firma). Opcional.' },
      },
      required: ['name', 'url'],
    },

    async execute(args) {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const url = typeof args.url === 'string' ? args.url.trim() : '';
      if (!name || !url) {
        return { error: 'Faltan datos obligatorios: name y url.' };
      }

      const services = Array.isArray(args.services) ? args.services.map(String) : [];
      const highlights = Array.isArray(args.highlights) ? args.highlights.map(String) : [];
      const score = typeof args.score === 'number' ? args.score : undefined;
      const yourName = typeof args.your_name === 'string' && args.your_name.trim() ? args.your_name.trim() : '';
      const yourCompany =
        typeof args.your_company === 'string' && args.your_company.trim() ? args.your_company.trim() : '';

      const user = [
        `Empresa del lead: ${name}`,
        `Sitio: ${url}`,
        score !== undefined ? `Puntaje de fitting: ${score}/100` : undefined,
        services.length > 0 ? `Servicios que ofrece: ${services.join(', ')}` : undefined,
        highlights.length > 0 ? `Por qué nos interesa: ${highlights.join('; ')}` : undefined,
        yourName ? `Firma: ${yourName}${yourCompany ? `, ${yourCompany}` : ''}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n');

      const system =
        'Sos un asistente de prospección B2B. Escribí un PRIMER email de contacto en español, ' +
        'conciso (150-200 palabras), personalizado con datos del lead, sin promesas falsas y ' +
        'sin inventar datos que no estén en el contexto. Asunto corto y atractivo, cuerpo con ' +
        'un gancho real, un hecho concreto de la empresa y una pregunta de cierre. ' +
        'El DESTINATARIO es la empresa del lead (no saludes a tu propia firma ni uses tu nombre como destinatario). ' +
        'Devolvé SOLO JSON: {"subject": "...", "body": "..."}, sin texto fuera del JSON.';

      try {
        const res = await provider.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { jsonSchema: schema, route: ROUTE_QUALITY, temperature: 0.7 },
        );
        const parsed = ensureObject(safeJsonParse(res.content));
        const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
        const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
        if (!subject || !body) {
          return { error: 'El modelo no devolvió un email válido (subject/body).', raw: res.content.slice(0, 300) };
        }
        return { email: { subject, body } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `No se pudo generar el email: ${message}` };
      }
    },
  };
}