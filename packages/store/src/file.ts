// File ledger: one JSON entry per line. Durable, and readable by anyone with a text editor. Used by the CLI and by the nightly
// GitHub Action until a Postgres database exists (the file lives on the `apex-state` branch, so git history is a second witness).
import { appendFileSync, existsSync, readFileSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GENESIS, LedgerConflict, verifyChain, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';

export class FileLedgerStore implements LedgerStore {
  durable = true; private rows: LedgerEntry[] = []; private size = -1;
  constructor(public path: string) { mkdirSync(dirname(path), { recursive: true }); }
  private load() {
    if (!existsSync(this.path)) { this.rows = []; this.size = 0; return; }
    const sz = statSync(this.path).size; if (sz === this.size) return;
    this.rows = readFileSync(this.path, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); this.size = sz;
    const v = verifyChain(this.rows); if (!v.ok) throw new Error(`ledger file is damaged at seq ${v.badSeq}: ${v.why}`);
  }
  async head() { this.load(); const l = this.rows[this.rows.length - 1]; return l ? { seq: l.seq, hash: l.hash } : null; }
  async read(fromSeq = 1, toSeq = Infinity) { this.load(); return this.rows.filter(e => e.seq >= fromSeq && e.seq <= toSeq); }
  async append(e: LedgerEntry) {
    this.load(); const l = this.rows[this.rows.length - 1];
    if (e.seq !== (l?.seq ?? 0) + 1 || e.prevHash !== (l?.hash ?? GENESIS)) throw new LedgerConflict();
    appendFileSync(this.path, JSON.stringify(e) + '\n'); this.rows.push(e); this.size = statSync(this.path).size;
  }
}

/** One run at a time (docs/design/04 s19). Returns a release function, or null when another run holds the lock. A lock older than `staleMs` is taken over. */
export function fileLock(path: string, staleMs = 2 * 3600e3): (() => void) | null {
  mkdirSync(dirname(path), { recursive: true });
  try { if (existsSync(path) && Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path); const fd = openSync(path, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); }
  catch { return null; }
  return () => { try { unlinkSync(path); } catch { /* already gone */ } };
}
