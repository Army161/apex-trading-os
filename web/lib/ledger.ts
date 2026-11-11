// The dashboard's access to the autopilot ledger. Postgres when DATABASE_URL is set; the file ledger when APEX_LEDGER_FILE or
// APEX_STATE_DIR points at one (local development and the terminal's own state); otherwise none, and the screens say so.
// Server only. Every screen and API route reads through here, so the web, the terminal and the API see the same entries.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cookies } from 'next/headers';
import { Ledger, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';
import { loadConfig } from '@apex/kernel/config';
import { statusFrom, type LedgerKind, type ShellStatus } from './status';
import { cord } from './andon';
import { getJSON, persistent } from './store';
import { authEnabled, isAdmin } from './auth';

type Open = { store: LedgerStore; kind: 'postgres' | 'file' };
const g = globalThis as unknown as { __apexLedger?: Promise<Open | null>; __apexLedgerRead?: { seq: number; hash: string; entries: LedgerEntry[] } };

async function open(env: NodeJS.ProcessEnv): Promise<Open | null> {
  if (env.DATABASE_URL) { const { PgLedgerStore } = await import('@apex/store/pg'); return { store: PgLedgerStore.connect(env.DATABASE_URL), kind: 'postgres' }; }
  const path = env.APEX_LEDGER_FILE || (env.APEX_STATE_DIR ? join(env.APEX_STATE_DIR, 'ledger.jsonl') : '');
  if (path && existsSync(path)) { const { FileLedgerStore } = await import('@apex/store/file'); return { store: new FileLedgerStore(path), kind: 'file' }; }
  return null;
}
/** One store per server process. A failed open is not remembered, so the next request tries again. */
export function ledgerStore(env: NodeJS.ProcessEnv = process.env): Promise<Open | null> {
  return g.__apexLedger ??= open(env).then(o => { if (!o) g.__apexLedger = undefined; return o; }, e => { g.__apexLedger = undefined; throw e; });
}

export type LedgerRead = { kind: LedgerKind; note: string | null; entries: LedgerEntry[] };
/** Every entry, oldest first. Entries are immutable, so a read is reused while the head has not moved. */
export async function readLedger(): Promise<LedgerRead> {
  try {
    const o = await ledgerStore(); if (!o) return { kind: 'none', note: null, entries: [] };
    const head = await o.store.head(); if (!head) return { kind: o.kind, note: null, entries: [] };
    const c = g.__apexLedgerRead;
    if (c && c.seq === head.seq && c.hash === head.hash) return { kind: o.kind, note: null, entries: c.entries };
    const entries = await o.store.read(); g.__apexLedgerRead = { seq: head.seq, hash: head.hash, entries };
    return { kind: o.kind, note: null, entries };
  } catch (e) { return { kind: 'error', note: (e instanceof Error ? e.message : String(e)).slice(0, 200), entries: [] }; }
}

export const paperCapital = () => loadConfig(process.env).paperCapital;

export async function shellStatus(): Promise<ShellStatus> {
  const [l, c, kill, signedIn] = await Promise.all([readLedger(), cord().catch(() => null), getJSON('killswitch', false).catch(() => null), signedInNow()]);
  return statusFrom({ ledger: l.kind, ledgerNote: l.note, entries: l.entries, capital: paperCapital(),
    // The dashboard's own halt switches live in its store. If that store cannot be read, say halted rather than guess.
    cord: c ?? { on: true, by: 'apex', reason: 'The halt state could not be read, so Apex is treated as halted.' }, killswitch: kill ?? false,
    persistent, signedIn, authEnabled, aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY), now: Date.now() });
}
/** True when this browser may use the admin controls. With no password set that is local development only. */
async function signedInNow() { try { void (await cookies()); return await isAdmin(); } catch { return false; } }

/** Record a halt in the ledger, so the autopilot run sees it. Returns what happened in words the header can show. */
export async function ledgerHalt(by: string, reason: string): Promise<'recorded' | 'no_ledger' | 'failed'> {
  try {
    const o = await ledgerStore(); if (!o) return 'no_ledger';
    await new Ledger(o.store).append('halt', 'dashboard', { level: 'andon', by, reason: reason.slice(0, 500) });
    return 'recorded';
  } catch { return 'failed'; }
}
