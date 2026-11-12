// The executor's local journal (docs/design/02 s6, step 3). Append-only JSON lines, each one flushed to disk before the next
// step runs. It lives outside the repo, on Jeremy's machine. A line that cannot be read makes the whole journal unreadable,
// and an unreadable journal refuses every order (fail closed).
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Mode = 'live' | 'rehearsal';
/**
 * submitting: written before the broker is called. sent, refused, unconfirmed, cancelled: what the broker answered.
 * fill: the body to post back, written before the post. posted: the dashboard took it. rehearsal: what would have been sent.
 * cursor: the last ledger seq this mode is done with. andon: the executor pulled the cord.
 */
export type RecordType = 'submitting' | 'sent' | 'refused' | 'unconfirmed' | 'cancelled' | 'fill' | 'posted' | 'rehearsal' | 'cursor' | 'andon';
export type JournalRecord = { type: RecordType; mode: Mode; at: number; id?: string; [k: string]: unknown };

export interface Journal {
  read(): JournalRecord[]; append(r: JournalRecord): void;
  /** Takes the one-time right to send this intent. True for the first caller only, across processes; a claim is never released. */
  claim(id: string): boolean;
}

export class FileJournal implements Journal {
  constructor(public path: string) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); }
  read(): JournalRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split('\n').filter(l => l.trim()).map((l, i) => {
      let r: any; try { r = JSON.parse(l); } catch { throw new Error(`journal line ${i + 1} is not JSON`); }
      if (!r || typeof r.type !== 'string' || (r.mode !== 'live' && r.mode !== 'rehearsal') || !Number.isFinite(r.at)) throw new Error(`journal line ${i + 1} is malformed`);
      return r as JournalRecord;
    });
  }
  /** An empty marker file per intent, created with O_EXCL: two runs at once cannot both get true. */
  claim(id: string): boolean {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('an intent id is 64 hex characters');
    const dir = join(dirname(this.path), 'claimed'); mkdirSync(dir, { recursive: true, mode: 0o700 });
    let fd: number; try { fd = openSync(join(dir, id), 'wx', 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false; throw e; }
    try { fsyncSync(fd); } finally { closeSync(fd); }
    return true;
  }
  append(r: JournalRecord) {
    const fd = openSync(this.path, 'a', 0o600);
    try { writeSync(fd, JSON.stringify(r) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  }
}

/** Live: any live record for the id means it was sent, or may have been. Rehearsal: any record at all. */
export const seenBefore = (rows: JournalRecord[], id: string, mode: Mode) => rows.some(r => r.id === id && r.type !== 'cursor' && (mode === 'rehearsal' || r.mode === 'live'));
export const cursorOf = (rows: JournalRecord[], mode: Mode) => rows.filter(r => r.type === 'cursor' && r.mode === mode).reduce((m, r) => Math.max(m, Number(r.seq) || 0), 0);
/** Fill bodies written but not yet taken by the dashboard, oldest first. */
export const pendingPosts = (rows: JournalRecord[]) => {
  const done = new Set(rows.filter(r => r.type === 'posted').map(r => String(r.body)));
  return rows.filter(r => r.type === 'fill' && typeof r.body === 'string' && !done.has(r.body)).map(r => ({ id: String(r.id), body: r.body as string }));
};
/** The highest account equity this mode has seen, for the live book's peak. */
export const peakEquity = (rows: JournalRecord[], mode: Mode) => rows.reduce((m, r) => (r.mode === mode && typeof r.equity === 'number' && Number.isFinite(r.equity) ? Math.max(m, r.equity) : m), 0);
