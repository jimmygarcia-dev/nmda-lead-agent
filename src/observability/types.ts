export interface LlmCallEvent {
  turn: number;
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

export interface ToolCallEvent {
  turn: number;
  tool: string;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface RunEndEvent {
  /** true si terminó con kind=final; false si se agotaron turnos. */
  final: boolean;
  turns: number;
  steps: number;
  ms: number;
  answerLength: number;
}

/**
 * Un observador del agente: recibe eventos estructurados del ciclo
 * (think -> llm, act -> tool, resultado de la ejecución).
 * Implementaciones concretas: Tracer (traces), Metrics (métricas), o ambas
 * combinadas con CompositeObserver.
 */
export interface AgentObserver {
  onRunStart(goal: string): void;
  onLlmCall(event: LlmCallEvent): void;
  onToolCall(event: ToolCallEvent): void;
  onRunEnd(event: RunEndEvent): void;
}