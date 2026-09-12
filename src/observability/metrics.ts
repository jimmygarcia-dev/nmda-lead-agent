import type { AgentObserver, LlmCallEvent, RunEndEvent, ToolCallEvent } from './types.js';

interface ToolStats {
  calls: number;
  totalMs: number;
  ok: number;
  errors: number;
}

/**
 * Métricas agregadas de una ejecución: contadores y promedios.
 * Sirven para el resumen que muestra el humán en pantalla (o un dashboard).
 */
export class Metrics implements AgentObserver {
  runs = 0;
  turns = 0;
  totalMs = 0;
  answerLength = 0;
  promptTokens = 0;
  completionTokens = 0;
  private llmCalls = 0;
  private llmTotalMs = 0;
  private readonly tools = new Map<string, ToolStats>();

  onRunStart(): void {
    this.runs++;
  }

  onLlmCall(event: LlmCallEvent): void {
    this.llmCalls++;
    this.llmTotalMs += event.ms;
    this.promptTokens += event.promptTokens;
    this.completionTokens += event.completionTokens;
  }

  onToolCall(event: ToolCallEvent): void {
    const stats = this.tools.get(event.tool) ?? { calls: 0, totalMs: 0, ok: 0, errors: 0 };
    stats.calls++;
    stats.totalMs += event.ms;
    if (event.ok) stats.ok++;
    else stats.errors++;
    this.tools.set(event.tool, stats);
  }

  onRunEnd(event: RunEndEvent): void {
    this.turns += event.turns;
    this.totalMs += event.ms;
    this.answerLength += event.answerLength;
  }

  /** Resumen en texto para humanos. */
  renderSummary(): string {
    const lines: string[] = ['métricas de la ejecución:'];
    lines.push(`  corridas       ${this.runs}`);
    lines.push(`  duración       ${(this.totalMs / 1000).toFixed(1)}s`);
    lines.push(`  turnos         ${this.turns}`);
    lines.push(`  llamadas LLM   ${this.llmCalls}  (avg ${(this.llmTotalMs / Math.max(1, this.llmCalls)).toFixed(0)}ms)`);
    lines.push(`  tokens         ${this.promptTokens} prompt + ${this.completionTokens} completion`);
    lines.push(`  longitud final ${this.answerLength} caracteres`);
    if (this.tools.size > 0) {
      lines.push('  tools:');
      for (const [name, s] of [...this.tools.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
        const avg = (s.totalMs / Math.max(1, s.calls)).toFixed(0);
        lines.push(`    ${name.padEnd(16)} ${String(s.calls).padStart(2)} llamadas · avg ${avg}ms · ${s.errors} errores`);
      }
    }
    return lines.join('\n');
  }
}