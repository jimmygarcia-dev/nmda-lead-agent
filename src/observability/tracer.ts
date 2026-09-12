import type { AgentObserver, LlmCallEvent, ToolCallEvent } from './types.js';

export type SpanKind = 'run' | 'llm' | 'tool';

export interface Span {
  kind: SpanKind;
  name: string;
  turn: number;
  start: number;
  end: number;
  ok: boolean;
  error?: string;
  ms: number;
}

/**
 * Tracer mínimo estilo OpenTelemetry:
 * arma un "árbol" de spans de una ejecución (run -> llm/tool) con duraciones.
 * Los spans son datos estructurados: se pueden imprimir, guardar o exportar.
 */
export class Tracer implements AgentObserver {
  private readonly spans: Span[] = [];
  private root: Span | undefined;
  private readonly t0 = performance.now();

  onRunStart(goal: string): void {
    this.root = {
      kind: 'run',
      name: goal,
      turn: 0,
      start: this.t0,
      end: 0,
      ok: true,
      ms: 0,
    };
    this.spans.push(this.root);
  }

  onLlmCall(event: LlmCallEvent): void {
    this.spans.push({
      kind: 'llm',
      name: `llm decisión (${event.promptTokens}+${event.completionTokens} tokens)`,
      turn: event.turn,
      start: 0,
      end: 0,
      ok: true,
      ms: event.ms,
    });
  }

  onToolCall(event: ToolCallEvent): void {
    this.spans.push({
      kind: 'tool',
      name: event.tool,
      turn: event.turn,
      start: 0,
      end: 0,
      ok: event.ok,
      error: event.error,
      ms: event.ms,
    });
  }

  onRunEnd(event: { turns: number; final: boolean; ms: number }): void {
    if (!this.root) return;
    this.root.ms = event.ms;
    this.root.name = `${this.root.name}  (${event.turns} turnos${event.final ? '' : ', sin conclusión'})`;
  }

  /** Los spans en forma de datos (exportables a JSON). */
  toJSON(): Span[] {
    return [...this.spans];
  }

  /** Árbol de tracing en texto, estilo "peras y manzanas" (junior-friendly). */
  renderTree(): string {
    const lines: string[] = ['trace (árbol de ejecución):'];
    if (!this.root) {
      return 'trace: (sin ejecución registrada)';
    }
    lines.push(`  run ${this.root.name} · ${this.root.ms.toFixed(0)}ms`);
    const children = this.spans.filter((s) => s.kind !== 'run');
    children.forEach((s, i) => {
      const isLast = i === children.length - 1;
      const edge = isLast ? '└──' : '├──';
      lines.push(
        `  ${edge} [${s.kind}] #${s.turn} ${s.name} · ${s.ms.toFixed(0)}ms ${s.ok ? 'ok' : `ERROR ${s.error ?? ''}`}`,
      );
    });
    return lines.join('\n');
  }
}