import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface StoredLead {
  name: string;
  url: string;
  location?: string;
  score: number;
  result: string;
  reasons: string[];
  matched: string[];
}

export interface StoredLeadRow extends StoredLead {
  id: number;
  created_at: string;
}

export interface StoredRun {
  goal: string;
  answer: string;
  turns: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  location TEXT,
  score INTEGER NOT NULL,
  result TEXT NOT NULL,
  reasons TEXT NOT NULL,
  matched TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_name_url ON leads(name, url);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  answer TEXT NOT NULL,
  turns INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

type Row = Record<string, unknown>;

function parseJsonList(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export class LeadStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(resolve(dbPath)), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  /** Guarda un lead. Con name+url únicos: si ya existe, no duplica. */
  saveLead(lead: StoredLead): { id: number; inserted: boolean } {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO leads (name, url, location, score, result, reasons, matched)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lead.name,
        lead.url,
        lead.location ?? null,
        lead.score,
        lead.result,
        JSON.stringify(lead.reasons ?? []),
        JSON.stringify(lead.matched ?? []),
      );

    const row = this.db
      .prepare('SELECT id FROM leads WHERE name = ? AND url = ?')
      .get(lead.name, lead.url) as Row | undefined;

    return {
      id: typeof row?.id === 'number' ? row.id : Number(res.lastInsertRowid),
      inserted: Number(res.changes) > 0,
    };
  }

  listLeads(limit = 50): StoredLeadRow[] {
    const rows = this.db
      .prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      url: String(r.url),
      location: r.location == null ? undefined : String(r.location),
      score: Number(r.score),
      result: String(r.result),
      reasons: parseJsonList(r.reasons),
      matched: parseJsonList(r.matched),
      created_at: String(r.created_at),
    }));
  }

  countLeads(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM leads').get() as Row;
    return Number(row.n);
  }

  saveRun(run: StoredRun): number {
    const res = this.db
      .prepare('INSERT INTO runs (goal, answer, turns) VALUES (?, ?, ?)')
      .run(run.goal, run.answer, run.turns);
    return Number(res.lastInsertRowid);
  }

  listRuns(
    limit = 20,
  ): Array<{ id: number; goal: string; answer: string; turns: number; created_at: string }> {
    const rows = this.db
      .prepare(
        'SELECT id, goal, answer, turns, created_at FROM runs ORDER BY created_at DESC, id DESC LIMIT ?',
      )
      .all(limit) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      goal: String(r.goal),
      answer: String(r.answer ?? ''),
      turns: Number(r.turns),
      created_at: String(r.created_at),
    }));
  }

  close(): void {
    this.db.close();
  }
}