import { cronMatches, parseCron, type CronSchedule } from './cron.js';
import type { Job, JobStore } from './jobStore.js';

export interface JobRunOutcome {
  answer: string;
  turns: number;
}

export type JobRunner = (job: Job) => Promise<JobRunOutcome>;

/**
 * Scheduler liviano in-process:
 * - guarda los jobs en SQLite (sobreviven reinicios),
 * - cada `pollMs` hace un tick: revisa si algún job "vence" (el cron coincide
 *   con este minuto y no corrió ya en él) y lo ejecuta con el runner.
 */
export class Scheduler {
  private readonly cronCache = new Map<number, CronSchedule>();
  private readonly running = new Set<number>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly jobs: JobStore,
    private readonly runner: JobRunner,
    private readonly pollMs = 15_000,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** ¿El job vence en `now`? */
  isDue(job: Job, now: Date): { due: boolean; reason?: string } {
    if (!job.enabled) return { due: false };

    let cron = this.cronCache.get(job.id);
    if (!cron) {
      try {
        cron = parseCron(job.schedule);
        this.cronCache.set(job.id, cron);
      } catch (err) {
        return { due: false, reason: `cron inválido: ${err instanceof Error ? err.message : err}` };
      }
    }

    if (!cronMatches(cron, now)) return { due: false };
    if (job.lastRunAt && sameMinute(job.lastRunAt, now)) {
      return { due: false, reason: 'ya corrió en este minuto' };
    }
    return { due: true };
  }

  /** Una pasada: revisa todos los jobs habilitados y ejecuta los que vencen. */
  async tick(now = new Date()): Promise<void> {
    for (const job of this.jobs.listEnabled()) {
      if (this.running.has(job.id)) {
        console.log(`  [scheduler] job #${job.id} aún corriendo, salteo`);
        continue;
      }

      const { due, reason } = this.isDue(job, now);
      if (!due) {
        if (reason) {
          console.log(`  [scheduler] job #${job.id} salteado: ${reason}`);
        }
        continue;
      }

      console.log(
        `  [scheduler] ejecuto job #${job.id} ("${job.goal.slice(0, 50)}...") cron "${job.schedule}"`,
      );

      this.running.add(job.id);
      try {
        const outcome = await this.runner(job);
        this.jobs.recordRun(job.id, now.toISOString(), JSON.stringify(outcome));
        console.log(
          `  [scheduler] job #${job.id} OK (${outcome.turns} turnos): ${outcome.answer.slice(0, 80)}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.jobs.recordError(job.id, now.toISOString(), message);
        console.error(`  [scheduler] job #${job.id} ERROR: ${message}`);
      } finally {
        this.running.delete(job.id);
      }
    }
  }
}

function sameMinute(iso: string, date: Date): boolean {
  const t = new Date(iso);
  return (
    t.getFullYear() === date.getFullYear() &&
    t.getMonth() === date.getMonth() &&
    t.getDate() === date.getDate() &&
    t.getHours() === date.getHours() &&
    t.getMinutes() === date.getMinutes()
  );
}