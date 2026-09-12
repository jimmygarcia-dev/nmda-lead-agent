import { DatabaseSync } from 'node:sqlite';

export interface Job {
  id: number;
  schedule: string;
  goal: string;
  enabled: number;
  createdAt: string;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule TEXT NOT NULL,
  goal TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_run_at TEXT,
  last_result TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
`;

type Row = Record<string, unknown>;

function toJob(r: Row): Job {
  return {
    id: Number(r.id),
    schedule: String(r.schedule),
    goal: String(r.goal),
    enabled: Number(r.enabled),
    createdAt: String(r.created_at),
    lastRunAt: r.last_run_at == null ? null : String(r.last_run_at),
    lastResult: r.last_result == null ? null : String(r.last_result),
    lastError: r.last_error == null ? null : String(r.last_error),
  };
}

export class JobStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  createJob(input: { schedule: string; goal: string }): Job {
    const res = this.db
      .prepare('INSERT INTO jobs (schedule, goal) VALUES (?, ?)')
      .run(input.schedule, input.goal);
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as Row;
    return toJob(row);
  }

  listJobs(): Job[] {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY created_at ASC, id ASC').all() as Row[];
    return rows.map(toJob);
  }

  listEnabled(): Job[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE enabled = 1 ORDER BY created_at ASC, id ASC')
      .all() as Row[];
    return rows.map(toJob);
  }

  setEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE jobs SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  recordRun(id: number, at: string, result: string): void {
    this.db
      .prepare('UPDATE jobs SET last_run_at = ?, last_result = ?, last_error = NULL WHERE id = ?')
      .run(at, result, id);
  }

  recordError(id: number, at: string, error: string): void {
    this.db
      .prepare('UPDATE jobs SET last_run_at = ?, last_error = ? WHERE id = ?')
      .run(at, error, id);
  }

  close(): void {
    this.db.close();
  }
}