import type { AgentObserver, LlmCallEvent, RunEndEvent, ToolCallEvent } from './types.js';

/** Reenvía cada evento a todos los observers registrados. */
export class CompositeObserver implements AgentObserver {
  private readonly observers: AgentObserver[];

  constructor(...observers: AgentObserver[]) {
    this.observers = observers;
  }

  onRunStart(goal: string): void {
    for (const o of this.observers) o.onRunStart(goal);
  }

  onLlmCall(event: LlmCallEvent): void {
    for (const o of this.observers) o.onLlmCall(event);
  }

  onToolCall(event: ToolCallEvent): void {
    for (const o of this.observers) o.onToolCall(event);
  }

  onRunEnd(event: RunEndEvent): void {
    for (const o of this.observers) o.onRunEnd(event);
  }
}