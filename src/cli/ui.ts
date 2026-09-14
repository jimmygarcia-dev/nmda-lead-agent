/* Capa de presentación del CLI (Underdog): spinner, tool cards y streaming. */

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
} as const;

export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function supportsColor(): boolean {
  return isTTY() && !process.env.NO_COLOR;
}

function paint(code: keyof typeof COLOR, s: string): string {
  return supportsColor() ? `${COLOR[code]}${s}${COLOR.reset}` : s;
}

export const style = {
  dim: (s: string) => paint('dim', s),
  green: (s: string) => paint('green', s),
  yellow: (s: string) => paint('yellow', s),
  red: (s: string) => paint('red', s),
  cyan: (s: string) => paint('cyan', s),
  bold: (s: string) => paint('bold', s),
};

/* ── Spinner ─────────────────────────────────────────────────────────────── */

export class Spinner {
  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private timer: NodeJS.Timeout | undefined;
  private idx = 0;
  private active = false;
  private shownLine = '';
  private suffix: (() => string) | undefined;

  start(label: string, suffix?: () => string): void {
    this.stop();
    if (!isTTY()) return;
    this.active = true;
    this.idx = 0;
    this.suffix = suffix;
    this.frame(label);
    this.timer = setInterval(() => this.frame(label), 90);
  }

  private frame(label: string): void {
    const spinner = this.frames[this.idx++ % this.frames.length];
    const extra = this.suffix ? ` ${this.suffix()}` : '';
    const line = `  ${style.dim(spinner + ' ' + label + '…')}${style.dim(extra)}`;
    this.shownLine = line;
    process.stdout.write(`\r\x1b[2K${line}`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.active) {
      process.stdout.write('\r\x1b[2K');
    }
    this.active = false;
  }
}

/* ── Tool cards ──────────────────────────────────────────────────────────── */

function summarizeArgs(args: Record<string, unknown>): string {
  try {
    const parts = Object.entries(args ?? {}).map(([k, v]) => {
      const s = typeof v === 'string' ? (v.length > 40 ? v.slice(0, 40) + '…' : v) : JSON.stringify(v);
      return `${k}=${s}`;
    });
    return parts.length > 0 ? ` ${parts.join(' ')}` : '';
  } catch {
    return '';
  }
}

export function summarizeValue(value: unknown, max = 140): string {
  try {
    const text = JSON.stringify(value, null, 0);
    return text.length > max ? text.slice(0, max) + '…' : text;
  } catch {
    return String(value);
  }
}

/** Tarjeta de un turno: `✓ tool(args)  → resultado/error`. */
export function toolCard(
  tool: string,
  args: Record<string, unknown>,
  extra?: { error?: string; result?: unknown; note?: string },
): string {
  const head = extra?.error
    ? `  ${style.red('✗')} ${style.cyan(tool)}${style.dim(summarizeArgs(args))}  ${style.red(extra.error)}`
    : `  ${style.green('✓')} ${style.cyan(tool)}${style.dim(summarizeArgs(args))}`;
  if (extra?.note) {
    return `${head}  ${style.dim(extra.note)}`;
  }
  if (extra?.error || extra?.result === undefined) return head;
  return `${head}\n     ${style.dim(`→ ${summarizeValue(extra.result)}`)}`;
}

/* ── Streaming de la respuesta final ─────────────────────────────────────── */

export interface TokenWriter {
  push(delta: string): void;
  end(): string;
}

/**
 * Muestra la respuesta final mientras el JSON de la decisión llega por tokens.
 * Oculta el scaffolding ("thought", llaves) y revela solo el campo `answer`
 * carácter a carácter (estilo Claude). Devuelve en end() el texto impreso.
 */
export function createFinalAnswerWriter(opts?: { onFirstChar?: () => void }): TokenWriter {
  let raw = '';
  let start = -1;
  let printed = '';
  let started = false;

  const decode = (s: string): string | null => {
    try {
      const v = JSON.parse(`"${s}"`) as unknown;
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  };

  const findClosingQuote = (from: number): number => {
    for (let i = from; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) return i;
    }
    return -1;
  };

  const tryPrint = (quoteAt: number): void => {
    if (start === -1) return;
    const seg = raw.slice(start, quoteAt);
    if (seg.length === 0) return;
    const dec = decode(seg);
    if (dec === null) return;
    const delta = dec.slice(printed.length);
    if (!delta) return;
    if (!started) {
      started = true;
      opts?.onFirstChar?.();
    }
    printed = dec;
    process.stdout.write(delta);
  };

  return {
    push(delta: string): void {
      raw += delta;
      if (start === -1) {
        const m = /"answer"\s*:\s*"/.exec(raw);
        if (m) start = m.index + m[0].length;
      }
      if (start !== -1) {
        const q = findClosingQuote(Math.max(start, 1));
        if (q !== -1) tryPrint(q);
      }
    },
    end(): string {
      if (start !== -1) {
        const q = findClosingQuote(Math.max(start, 1));
        if (q !== -1) tryPrint(q);
      }
      return printed;
    },
  };
}