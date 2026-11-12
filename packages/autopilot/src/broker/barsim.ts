// Paper broker: bar simulator (docs/design/04 s10). Red path. Deterministic. Uses the same per-bar fill rules as backtest()
// (entryFill, exitFill, barExit in @apex/engine/core), so a paper record and a backtest cannot drift apart.
// Order inside one bar, exactly as backtest(): exit decided on the previous bar fills at this open; then a pending entry fills
// at this open; then stop first, then target.
import { barExit, entryFill, exitFill, type Bar, type Sig } from '@apex/engine/core';
import { makeTrailer } from '@apex/engine/trail';
import type { Cost } from '@apex/kernel/gate';
import type { PositionState } from '@apex/kernel/view';
import type { Fill } from './types';

export type PendingIntent = { id: string; slotKey: string; symbol: string; assetClass: string; side: 1 | -1; barT: number; qty: number; stop: number; target: number | null };
export type SlotBook = { position: PositionState | null; pending: PendingIntent | null };

/** The stop as it stands at bar i for a position opened at entryIdx: the initial stop, moved by the strategy's trail on each bar since. */
export function stopAt(bars: Bar[], sig: Sig, pos: { side: 1 | -1; entry: number; stop0: number }, entryIdx: number, i: number): { stop: number; trailed: boolean } {
  if (!sig.trail) return { stop: pos.stop0, trailed: false };
  const tr = makeTrailer(bars, sig.trail); let stop = pos.stop0, mods = 0;
  for (let j = entryIdx; j < i; j++) { const ns = tr(j, pos.side, pos.entry, stop); if (!isNaN(ns)) { stop = ns; mods++; } }
  return { stop, trailed: mods > 0 };
}

/**
 * Advance one slot by one closed bar. `emit` is called once per fill, in order, and must apply the fill to `book` before returning
 * (the pipeline does this by appending to the ledger view). Returns the fills.
 */
export function stepBar(book: () => SlotBook, bars: Bar[], i: number, sig: Sig, cost: Cost, emit: (f: Fill) => void): Fill[] {
  const out: Fill[] = [], bar = bars[i], push = (f: Fill) => { out.push(f); emit(f); };
  const idxOf = (t: number) => { for (let j = i; j >= 0; j--) { if (bars[j].t === t) return j; if (bars[j].t < t) break; } return -1; };
  const exit = (pos: PositionState, raw: number, kind: Fill['kind']) => { const px = exitFill(raw, pos.side, cost.slip);
    push({ intent: pos.intent, slotKey: pos.slotKey, symbol: pos.symbol, assetClass: pos.assetClass, side: pos.side, kind, t: bar.t, price: px, qty: pos.qty, fee: cost.fee * px * pos.qty, stop: pos.stop0, target: pos.target, mode: 'paper' }); };

  // 1. An exit decided on the previous bar (signal or time) fills at this open.
  let pos = book().position;
  if (pos && i > 0) {
    const e = idxOf(pos.entryT);
    if (e >= 0 && e <= i - 1) { const held = i - e;                                               // bars held through i-1, entry bar included
      if ((pos.side === 1 && sig.lx[i - 1]) || (pos.side === -1 && sig.sx[i - 1])) exit(pos, bar.o, 'signal');
      else if (sig.maxBars && held >= sig.maxBars) exit(pos, bar.o, 'time'); }
  }
  // 2. A pending entry from the previous bar fills at this open. Anything older is stale and is cancelled, never filled late.
  const pend = book().pending;
  if (pend && !book().position) {
    const cancel = (note: string) => push({ intent: pend.id, slotKey: pend.slotKey, symbol: pend.symbol, assetClass: pend.assetClass, side: pend.side, kind: 'cancelled', t: bar.t, price: bar.o, qty: 0, fee: 0, stop: pend.stop, target: pend.target, mode: 'paper', note });
    if (i === 0 || pend.barT !== bars[i - 1].t) { if (pend.barT < bar.t) cancel('stale: the bar after the signal was missed'); }
    else { const px = entryFill(bar.o, pend.side, cost.slip);
      if ((pend.side === 1 && pend.stop >= px) || (pend.side === -1 && pend.stop <= px)) cancel('the open gapped past the stop');   // a live system never invents a stop
      else push({ intent: pend.id, slotKey: pend.slotKey, symbol: pend.symbol, assetClass: pend.assetClass, side: pend.side, kind: 'entry', t: bar.t, price: px, qty: pend.qty, fee: cost.fee * px * pend.qty, stop: pend.stop,
        target: sig.trail && !sig.trail.keepTarget ? null : pend.target, mode: 'paper' }); }
  }
  // 3. Stop first, then target. A gap through the stop fills at the open.
  pos = book().position;
  if (pos) { const e = idxOf(pos.entryT); if (e >= 0) { const s = stopAt(bars, sig, pos, e, i), x = barExit(bar, pos.side, s.stop, pos.target ?? NaN, s.trailed); if (x) exit(pos, x.px, x.reason); } }
  return out;
}
