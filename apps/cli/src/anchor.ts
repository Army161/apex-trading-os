// Anchoring the ledger (docs/design/04 s3.4). Once a day the head of the chain (its sequence number and hash) is saved to a
// small file under the state folder. The nightly workflow commits that folder, so git history is a second, dated witness:
// a ledger rewritten later would no longer match the heads that were saved before. `apex ledger verify` checks every saved
// head against the chain. The anchor entry in the ledger says which head was saved and where.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerEntry } from '@apex/kernel';

export type HeadFile = { date: string; seq: number; hash: string; entries: number };
export const headsDir = (stateDir: string) => join(stateDir, 'heads');
export function readHeads(stateDir: string): { heads: HeadFile[]; unreadable: string[] } {
  const dir = headsDir(stateDir), heads: HeadFile[] = [], unreadable: string[] = []; if (!existsSync(dir)) return { heads, unreadable };
  for (const n of readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort()) {
    try { const h = JSON.parse(readFileSync(join(dir, n), 'utf8')); if (!Number.isInteger(h.seq) || h.seq < 1 || !/^[0-9a-f]{64}$/.test(h.hash)) throw new Error('bad'); heads.push({ date: n.slice(0, 10), seq: h.seq, hash: h.hash, entries: Number(h.entries) || h.seq }); }
    catch { unreadable.push(n); } }
  return { heads, unreadable };
}
/** Every saved head must be the hash the chain has at that sequence number. The first one that is not is reported. */
export function checkHeads(entries: LedgerEntry[], saved: { heads: HeadFile[]; unreadable: string[] }): { ok: boolean; checked: number; badSeq: number | null; why: string | null } {
  if (saved.unreadable.length) return { ok: false, checked: 0, badSeq: null, why: `the saved head ${saved.unreadable[0]} cannot be read` };
  for (const h of saved.heads) { const e = entries[h.seq - 1];
    if (!e || e.seq !== h.seq) return { ok: false, checked: saved.heads.length, badSeq: h.seq, why: `the head saved on ${h.date} is entry ${h.seq}, and the ledger has no such entry` };
    if (e.hash !== h.hash) return { ok: false, checked: saved.heads.length, badSeq: h.seq, why: `the head saved on ${h.date} does not match entry ${h.seq}: the ledger was changed after that day` }; }
  return { ok: true, checked: saved.heads.length, badSeq: null, why: null };
}
/** What to save today, or why nothing is saved. Pure. */
export function planAnchor(entries: LedgerEntry[], now: number): { head: HeadFile } | { skip: string } {
  const last = entries[entries.length - 1]; if (!last) return { skip: 'The ledger is empty, so there is nothing to anchor.' };
  if (last.kind === 'anchor' && Number(last.payload?.seq) === last.seq - 1) return { skip: `Nothing was added since the last anchor (entry ${last.seq}).` };
  return { head: { date: new Date(now).toISOString().slice(0, 10), seq: last.seq, hash: last.hash, entries: entries.length } };
}
export function writeHead(stateDir: string, h: HeadFile): string {
  const dir = headsDir(stateDir); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${h.date}.json`), `${JSON.stringify({ seq: h.seq, hash: h.hash, entries: h.entries }, null, 1)}\n`); return `heads/${h.date}.json`;
}
