export interface CronField {
  /** Valores permitidos (ya expandidos, ordenados, únicos). */
  values: number[];
  /** true si el campo era "*" (sin restricción). */
  wildcard: boolean;
}

export interface CronSchedule {
  raw: string;
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

/**
 * Parser cron mínimo (5 campos): minuto hora díaDelMes mes díaDeLaSemana.
 * Soporta asterisco, pasos (slash-N), valores puntuales, rangos ab y comas.
 * No soporta nombres (MON) ni @-aliases a propósito: es para aprender, no competir.
 */
export function parseCron(expr: string): CronSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expresión cron inválida (se esperaban 5 campos): "${expr}"`);
  }
  return {
    raw: expr.trim(),
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6), // 0 = domingo
  };
}

function parseField(field: string, min: number, max: number): CronField {
  if (field === '*') {
    return { values: range(min, max), wildcard: true };
  }

  const values: number[] = [];
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.push(i);
    } else if (part.startsWith('*/')) {
      const step = Number(part.slice(2));
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Paso inválido en campo cron "${part}"`);
      }
      for (let i = min; i <= max; i += step) values.push(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        throw new Error(`Rango inválido en campo cron "${part}"`);
      }
      for (let i = a; i <= b; i++) values.push(i);
    } else {
      const v = Number(part);
      if (!Number.isInteger(v)) {
        throw new Error(`Valor inválido en campo cron "${part}"`);
      }
      values.push(v);
    }
  }

  return { values: [...new Set(values)].sort((a, b) => a - b), wildcard: false };
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

/** ¿El minuto actual cumple la expresión cron? */
export function cronMatches(cron: CronSchedule, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  if (!cron.minute.values.includes(minute)) return false;
  if (!cron.hour.values.includes(hour)) return false;
  if (!cron.month.values.includes(month)) return false;

  const domOk = cron.dom.values.includes(dom);
  const dowOk = cron.dow.values.includes(dow);

  // Regla clásica de cron: si ambos campos de día están restringidos, alcanza
  // con que coincida UNO (OR). Si uno es "*", ese no restringe (el otro manda).
  const dayOk =
    cron.dom.wildcard && cron.dow.wildcard
      ? true
      : cron.dom.wildcard
        ? dowOk
        : cron.dow.wildcard
          ? domOk
          : domOk || dowOk;

  return dayOk;
}

/** Próxima fecha (estrictamente después de `from`) que cumple el cron. */
export function cronNext(cron: CronSchedule, from: Date, maxScanMinutes = 20160): Date {
  const candidate = new Date(from);
  for (let i = 0; i < maxScanMinutes; i++) {
    candidate.setMinutes(candidate.getMinutes() + 1);
    if (cronMatches(cron, candidate)) return new Date(candidate);
  }
  throw new Error(`No se encontró próxima ejecución en ${maxScanMinutes} minutos para "${cron.raw}"`);
}