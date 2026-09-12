import type { LeadStore, StoredLeadRow } from '../persistence/store.js';

export interface MemoryRun {
  id: number;
  goal: string;
  answer: string;
  turns: number;
  created_at: string;
}

export interface MemoryLead {
  id: number;
  name: string;
  url: string;
  location?: string;
  score: number;
  result: string;
  created_at: string;
}

export interface MemoryRecall {
  recentRuns: MemoryRun[];
  savedLeads: MemoryLead[];
}

const ANSWER_PREVIEW = 160;

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + '...';
}

/**
 * Memoria episódica/long-term del agente: recupera lo persistido
 * (ejecuciones previas y leads guardados) y lo vuelve texto de contexto.
 */
export class AgentMemory {
  private readonly store: LeadStore;

  constructor(store: LeadStore) {
    this.store = store;
  }

  recall(runLimit = 5, leadLimit = 15): MemoryRecall {
    const runs = (this.store.listRuns(runLimit) as MemoryRun[]).map((r) => ({
      ...r,
      answer: r.answer,
    }));
    const leads = (this.store.listLeads(leadLimit) as StoredLeadRow[]).map((l) => ({
      id: l.id,
      name: l.name,
      url: l.url,
      location: l.location,
      score: l.score,
      result: l.result,
      created_at: l.created_at,
    }));
    return { recentRuns: runs, savedLeads: leads };
  }

  /** Convierte un recall en un bloque de texto para el system prompt. */
  toContextText(recall: MemoryRecall): string {
    const lines: string[] = ['Memoria de ejecuciones previas y leads ya guardados:'];

    if (recall.recentRuns.length === 0 && recall.savedLeads.length === 0) {
      lines.push('  (vacío: es la primera vez, no hay contexto previo)');
      return lines.join('\n');
    }

    if (recall.recentRuns.length > 0) {
      lines.push('');
      lines.push('Ejecuciones previas:');
      for (const run of recall.recentRuns) {
        lines.push(
          `  [#${run.id} - ${run.created_at}] "${shorten(run.goal, 90)}" ` +
            `(${run.turns} turnos) -> ${shorten(run.answer, ANSWER_PREVIEW)}`,
        );
      }
    }

    if (recall.savedLeads.length > 0) {
      lines.push('');
      lines.push('Leads ya guardados (NO volver a auditar):');
      for (const lead of recall.savedLeads) {
        lines.push(
          `  [${lead.id}] ${lead.result.toUpperCase()} ${lead.score}/100 - ` +
            `${lead.name}${lead.location ? ` (${lead.location})` : ''} - ${lead.url}`,
        );
      }
    }

    lines.push(
      '',
      'Si una empresa ya figura entre los leads guardados, no la vuelvas a buscar,',
      'calificar ni guardar: se menciona que ya se trabajó con ella.',
    );

    return lines.join('\n');
  }
}