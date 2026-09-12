import readline from 'node:readline';
import type { ApprovalContext, ApprovalDecision, HumanApprover } from './types.js';

/**
 * Aprobador humano por consola: pausa la ejecución, muestra el contexto
 * y espera "s/N" por stdin. Para usarlo de verdad (no para smokes).
 */
export class ConsoleApprover implements HumanApprover {
  renderPrompt(ctx: ApprovalContext): string {
    const lines = [
      '',
      '=== ⏸  APROBACIÓN HUMANA REQUERIDA ===',
      `objetivo:  ${ctx.goal}`,
      `turno:     ${ctx.turn}`,
      `acción:    ${ctx.tool}(${JSON.stringify(ctx.args)})`,
      '=========================================',
    ];
    return lines.join('\n');
  }

  async request(ctx: ApprovalContext): Promise<ApprovalDecision> {
    console.log(this.renderPrompt(ctx));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await new Promise<string>((resolve) =>
        rl.question('¿apruebo la ejecución? (s/N): ', resolve),
      );
      const trimmed = answer.trim();
      return { approved: /^(s|si|sí|y|yes)$/i.test(trimmed), note: trimmed || 'no' };
    } finally {
      rl.close();
    }
  }
}