export interface GuardCheck {
  allowed: boolean;
  reason?: string;
  /** Si trae texto, es la respuesta ya saneada. */
  redacted?: string;
}

export interface GuardRailPolicy {
  /** Máximo de llamadas al LLM por ejecución. */
  maxLlmCalls?: number;
  /** Máximo de milisegundos de ejecución. */
  maxDurationMs?: number;
  /** Máximo de veces que se permite repetir el MISMO tool con la MISMA huella. */
  maxRepeatTool?: number;
  /** Tools que el agente NO puede invocar en esta ejecución. */
  blockedToolNames?: string[];
  /** Patrones que un objetivo no debe pedir (se rechaza antes de hablar con el LLM). */
  blockedGoalPatterns?: RegExp[];
  /** Sanea la respuesta final: reemplaza emails / DNI / teléfonos. */
  redactPii?: boolean;
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DNI_PATTERN = /\b\d{1,2}\.\d{3}\.\d{3}\b/g;
const PHONE_PATTERN = /\b(?:\+?\d{2,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{4}[\s-]?\d{4}\b/g;

function fingerprint(tool: string, args: Record<string, unknown>): string {
  return `${tool}|${JSON.stringify(args)}`;
}

/**
 * Guardrails deterministas: vallas que se mantienen SOLAS, sin preguntar al LLM.
 * Presupuesto (llamadas al LLM / tiempo), denylist de tools, detección de
 * repetición y saneado de PII en la respuesta final.
 */
export class Guardrails {
  private llmCalls = 0;
  private startedAt = 0;
  private readonly attempts = new Map<string, number>();

  constructor(private readonly policy: GuardRailPolicy) {}

  /** Estado de una ejecución nueva. */
  beginRun(): void {
    this.llmCalls = 0;
    this.startedAt = performance.now();
    this.attempts.clear();
  }

  checkGoal(goal: string): GuardCheck {
    for (const pattern of this.policy.blockedGoalPatterns ?? []) {
      if (pattern.test(goal)) {
        return { allowed: false, reason: `el objetivo coincide con un patrón bloqueado: ${pattern}` };
      }
    }
    return { allowed: true };
  }

  afterLlmCall(): void {
    this.llmCalls++;
  }

  budgetMet(): GuardCheck {
    const policy = this.policy;
    if (policy.maxLlmCalls !== undefined && this.llmCalls >= policy.maxLlmCalls) {
      return {
        allowed: false,
        reason: `presupuesto de ${policy.maxLlmCalls} llamadas al LLM alcanzado`,
      };
    }
    if (policy.maxDurationMs !== undefined && performance.now() - this.startedAt >= policy.maxDurationMs) {
      return {
        allowed: false,
        reason: `presupuesto de tiempo (${(policy.maxDurationMs / 1000).toFixed(0)}s) alcanzado`,
      };
    }
    return { allowed: true };
  }

  beforeTool(tool: string, args: Record<string, unknown>): GuardCheck {
    if ((this.policy.blockedToolNames ?? []).includes(tool)) {
      return { allowed: false, reason: `el tool "${tool}" está en la denylist de esta ejecución` };
    }
    const maxRepeat = this.policy.maxRepeatTool;
    if (maxRepeat !== undefined) {
      const count = this.attempts.get(fingerprint(tool, args)) ?? 0;
      if (count >= maxRepeat) {
        return { allowed: false, reason: `repetiste ${tool} con los mismos argumentos ${count} veces` };
      }
    }
    return { allowed: true };
  }

  afterTool(tool: string, args: Record<string, unknown>): void {
    const key = fingerprint(tool, args);
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
  }

  checkOutput(answer: string): GuardCheck {
    let redacted = answer;
    if (this.policy.redactPii) {
      redacted = answer
        .replace(EMAIL_PATTERN, '[EMAIL]')
        .replace(DNI_PATTERN, '[DNI]')
        .replace(PHONE_PATTERN, '[TELÉFONO]');
    }
    return { allowed: true, redacted };
  }
}