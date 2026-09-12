import type { LeadProfile, QualificationCriteria, QualificationVerdict } from './types.js';

const SCORE_LOCATION = 25;
const SCORE_SERVICES = 35;
const SCORE_OTHER = 40;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normList(arr: string[]): string[] {
  return arr.map(normalize).filter((t) => t.length > 0);
}

/** Serializa los criterios para incluirlos en el system prompt del agente. */
export function criteriaToPromptText(c: QualificationCriteria): string {
  const lines = [
    `- Objetivo de lead: ${c.label}`,
    `- Ubicaciones buscadas: ${c.locations.join(', ') || '(cualquiera)'}`,
  ];
  if (c.industries?.length) lines.push(`- Industrias: ${c.industries.join(', ')}`);
  lines.push(`- Servicios buscados: ${c.services.join(', ')}`);
  if (c.keywords?.length) lines.push(`- Palabras clave: ${c.keywords.join(', ')}`);
  lines.push(`- Puntaje mínimo para considerar lead calificado: ${c.minScore}/100`);
  return lines.join('\n');
}

/**
 * Evaluación determinística de un candidato contra los criterios.
 * Ubicación (25) + servicios (35) + industrias/palabras clave (40).
 */
export function qualify(profile: LeadProfile, criteria: QualificationCriteria): QualificationVerdict {
  const haystack = normalize(
    [profile.name, profile.location ?? '', profile.industry ?? '', profile.description].join(' | '),
  );

  const locations = normList(criteria.locations);
  const services = normList(criteria.services);
  const industries = normList(criteria.industries ?? []);
  const keywords = normList(criteria.keywords ?? []);

  const matchedSet = new Set<string>();
  const hits = (terms: string[]) =>
    terms.filter((t) => {
      if (haystack.includes(t)) {
        matchedSet.add(t);
        return true;
      }
      return false;
    });

  const locationHits = hits(locations);
  const locationScore = locations.length ? (locationHits.length ? SCORE_LOCATION : 0) : Math.round(SCORE_LOCATION * 0.6);

  const servicesHits = hits(services);
  const servicesScore = services.length
    ? Math.round(SCORE_SERVICES * (servicesHits.length / services.length))
    : SCORE_SERVICES;

  const otherHits = hits([...industries, ...keywords]);
  const otherTotal = industries.length + keywords.length;
  const otherScore = otherTotal
    ? Math.round(SCORE_OTHER * (otherHits.length / otherTotal))
    : SCORE_OTHER;

  const score = Math.min(100, locationScore + servicesScore + otherScore);

  const reasons: string[] = [];
  if (locationHits.length) {
    reasons.push(`Coincide la ubicación buscada: ${locationHits.join(', ')}.`);
  }
  if (servicesHits.length) {
    reasons.push(`Servicios que coinciden: ${servicesHits.join(', ')} (${servicesHits.length}/${services.length}).`);
  }
  if (otherHits.length) {
    reasons.push(`Industrias/palabras clave que coinciden: ${otherHits.join(', ')}.`);
  }
  if (reasons.length === 0) {
    reasons.push('No coincide ubicación, servicios ni palabras clave.');
  }

  const result =
    score >= criteria.minScore
      ? 'sí'
      : score >= Math.round(criteria.minScore * 0.7)
        ? 'quizás'
        : 'no';

  return { result, score, reasons, matched: [...matchedSet] };
}