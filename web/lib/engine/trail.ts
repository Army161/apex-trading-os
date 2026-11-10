// Pluggable trailing stops (archive/chat/81, an MQL5 "HFT" EA walkthrough). Our own code, paper only, not a port of the EA.
// The author says he has not tested the EA himself, warns it bleeds in quiet markets, needs low spreads, and sends so many
// stop modifications that a broker may ban the account. So every mode here is UNPROVEN and the backtester counts modifications.
//
// Modes (decided on the bar close, live from the next bar):
//   scalp   : once the trade is `trigger` in profit, keep the stop `distance` behind the bid (ask for shorts).
//   candles : stop at the lowest low (highest high for shorts) of the previous N closed bars.
//   ma      : stop at a fast SMA or EMA of the close.
//   tenkan  : stop at the Ichimoku Tenkan-sen, (highest high + lowest low) / 2 over `period` bars (9 by default).
// Guards, the same ones the video uses: never loosen the stop, keep it beyond the entry price (locks in at least break-even),
// keep it on the right side of the current bid/ask, and at least `stopLevel` away from it (the broker's minimum distance).
// Distances are in ATR(14) multiples so one setting works on SPY, BTC or EURUSD; `spread` is a fraction of price.
import { Bar, atr, ema, sma, rollMax, rollMin } from './core';

export type TrailMode = 'scalp' | 'candles' | 'ma' | 'tenkan';
export type TrailSpec = {
  mode: TrailMode;
  trigger?: number;      // scalp: profit in ATR before trailing starts (default 0.5)
  distance?: number;     // scalp: distance behind price in ATR (default 0.3)
  n?: number;            // candles: how many previous bars (default 2)
  period?: number;       // ma: period (default 9); tenkan: period (default 9)
  maType?: 'sma' | 'ema';
  spread?: number;       // bid/ask spread as a fraction of price (default 0)
  stopLevel?: number;    // broker minimum stop distance in ATR (default 0)
  beyondEntry?: boolean; // only move the stop once it can sit past the entry (default true, as in the video)
  keepTarget?: boolean;  // keep the strategy's fixed target as well (default false: the trail replaces it)
};

/** Returns a function giving the new stop for an open trade at bar i, or NaN when the guards say "don't move it". */
export function makeTrailer(b: Bar[], spec: TrailSpec) {
  const a = atr(b, 14), c = b.map(x => x.c), H = b.map(x => x.h), L = b.map(x => x.l);
  const n = spec.n ?? 2, per = spec.period ?? 9, half = (spec.spread ?? 0) / 2;
  const ma = spec.mode === 'ma' ? (spec.maType === 'sma' ? sma(c, per) : ema(c, per)) : null;
  const hiN = spec.mode === 'candles' ? rollMax(H, n) : spec.mode === 'tenkan' ? rollMax(H, per) : null;
  const loN = spec.mode === 'candles' ? rollMin(L, n) : spec.mode === 'tenkan' ? rollMin(L, per) : null;
  return (i: number, side: 1 | -1, entry: number, cur: number): number => {
    const ai = a[i]; if (isNaN(ai)) return NaN;
    const bid = c[i] * (1 - half), ask = c[i] * (1 + half), px = side === 1 ? bid : ask, gap = (spec.stopLevel ?? 0) * ai;
    let cand: number;
    switch (spec.mode) {
      case 'scalp': if ((px - entry) * side <= (spec.trigger ?? 0.5) * ai) return NaN; cand = px - side * (spec.distance ?? 0.3) * ai; break;
      case 'candles': cand = side === 1 ? loN![i] : hiN![i]; break;        // includes bar i, which has just closed
      case 'ma': cand = ma![i]; break;
      case 'tenkan': cand = (hiN![i] + loN![i]) / 2; break;
    }
    if (isNaN(cand)) return NaN;
    if ((cand - cur) * side <= 0) return NaN;                                // never loosen (or re-send the same stop)
    if ((spec.beyondEntry ?? true) && (cand - entry) * side <= 0) return NaN; // keep it past the entry
    if ((px - cand) * side <= gap) return NaN;                               // right side of price, and the broker's stop level
    return cand;
  };
}
