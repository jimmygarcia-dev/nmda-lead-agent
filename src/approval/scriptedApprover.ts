import type { ApprovalContext, ApprovalDecision, HumanApprover } from './types.js';

/**
 * Aprobador con respuestas pre-cargadas (cola). Sirve para tests/smokes:
 * simula a un humano sin esperar stdin.
 */
export class ScriptedApprover implements HumanApprover {
  private readonly decisions: ApprovalDecision[];
  private i = 0;

  constructor(decisions: ApprovalDecision[]) {
    this.decisions = decisions;
  }

  async request(_ctx: ApprovalContext): Promise<ApprovalDecision> {
    const fallback: ApprovalDecision = { approved: false, note: 'script terminado -> denegado' };
    const decision = this.decisions[Math.min(this.i, this.decisions.length - 1)] ?? fallback;
    this.i++;
    return decision;
  }

  get called(): number {
    return this.i;
  }
}