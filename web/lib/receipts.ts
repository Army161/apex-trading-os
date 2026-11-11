// The public receipts page's data (docs/design/04 s3.4). Each slot's forward paper record with the ledger entries behind it,
// so a reader can check it. Only what is safe to publish is built here: strategy and market names, dates, results in units
// of risk, entry numbers and hashes. No money amount, position size, limit, key or setting ever enters this shape.
import type { LedgerEntry } from '@apex/kernel/ledger';
import type { LedgerView } from '@apex/kernel/view';
import { getJSON, setJSON } from './store';

const K = 'settings:receipts';
/** Off unless Jeremy switched it on. A store that cannot be read counts as off. */
export const receiptsOn = () => getJSON<boolean>(K, false).then(v => v === true, () => false);
export const setReceipts = (on: boolean) => setJSON(K, on === true);

export type Ref = { seq: number; hash: string };
export type PublicTrade = { closed: string; side: 'long' | 'short'; r: number; exit: string; entry: Ref | null; fill: Ref };
export type PublicSlot = { name: string; strategy: string; market: string; timeframe: string; status: string; role: string; locked: string; lock: Ref | null;
  lastCheck: (Ref & { month: string; state: string }) | null; trades: PublicTrade[]; n: number; wins: number; totalR: number; avgR: number | null };
export type PublicAnchor = Ref & { covers: number; date: string; file: string | null };
export type PublicReceipts = { head: Ref | null; entries: number; slots: PublicSlot[]; anchors: PublicAnchor[]; lastAnchored: number };

const day = (t: number) => new Date(t).toISOString().slice(0, 10), r4 = (x: number) => Math.round(x * 1e4) / 1e4;
export function publicReceipts(v: LedgerView, entries: LedgerEntry[]): PublicReceipts {
  const ref = (e: LedgerEntry | undefined): Ref | null => e ? { seq: e.seq, hash: e.hash } : null, bySeq = (n: number) => entries[n - 1]?.seq === n ? entries[n - 1] : entries.find(e => e.seq === n);
  // Pair each closing fill with the entry fill before it, per slot, in ledger order. This is the order the view closed them in.
  const open = new Map<string, LedgerEntry>(), exits = new Map<string, { entry: Ref | null; fill: Ref }[]>(), checks = new Map<string, LedgerEntry>();
  for (const e of entries) { const p = e.payload ?? {};
    if (e.kind === 'graduation_check') checks.set(String(p.slotKey), e);
    if (e.kind !== 'fill' || p.kind === 'cancelled') continue;
    if (p.kind === 'entry') { open.set(p.slotKey, e); continue; }
    if (!open.has(p.slotKey)) continue;
    exits.set(p.slotKey, [...(exits.get(p.slotKey) ?? []), { entry: ref(open.get(p.slotKey)), fill: ref(e)! }]); open.delete(p.slotKey); }
  const slots = [...v.slots.values()].sort((a, b) => a.lockedAt - b.lockedAt).map((s): PublicSlot => {
    const closed = v.closed.filter(c => c.slotKey === s.slotKey), refs = exits.get(s.slotKey) ?? [], g = checks.get(s.slotKey);
    const trades = closed.map((c, i): PublicTrade | null => refs[i] ? { closed: day(c.exitT), side: c.side === 1 ? 'long' : 'short', r: r4(c.r), exit: String(c.reason), ...refs[i] } : null).filter((t): t is PublicTrade => t !== null);
    const total = trades.reduce((a, t) => a + t.r, 0);
    return { name: s.slotKey, strategy: s.strategy, market: s.symbol, timeframe: s.tf, status: s.status, role: s.role, locked: day(s.lockedAt), lock: ref(bySeq(s.lockSeq)),
      lastCheck: g ? { seq: g.seq, hash: g.hash, month: String(g.payload?.month ?? day(g.ts).slice(0, 7)), state: String(g.payload?.state ?? '') } : null,
      trades, n: trades.length, wins: trades.filter(t => t.r > 0).length, totalR: r4(total), avgR: trades.length ? r4(total / trades.length) : null }; });
  const anchors = entries.filter(e => e.kind === 'anchor').map((e): PublicAnchor => ({ seq: e.seq, hash: String(e.payload?.hash ?? ''), covers: Number(e.payload?.seq) || 0, date: day(e.ts), file: typeof e.payload?.file === 'string' ? e.payload.file : null }));
  return { head: ref(entries[entries.length - 1]), entries: entries.length, slots, anchors: anchors.slice(-30).reverse(), lastAnchored: anchors.reduce((m, a) => Math.max(m, a.covers), 0) };
}
