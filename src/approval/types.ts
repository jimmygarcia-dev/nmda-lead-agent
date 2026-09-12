export interface ApprovalContext {
  goal: string;
  turn: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface ApprovalDecision {
  approved: boolean;
  note?: string;
}

/** Quien decide si el agente puede ejecutar una acción crítica. */
export interface HumanApprover {
  request(ctx: ApprovalContext): Promise<ApprovalDecision>;
}

/** Gate de aprobación que se le pasa al loop: humano + qué tools requieren OK. */
export interface ApprovalGate {
  approver: HumanApprover;
  requiredTools: string[];
}