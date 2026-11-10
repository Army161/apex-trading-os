import { candles } from './market';
import { STRATEGIES, confluence } from './engine/strategies';
import { backtest, monteCarlo } from './engine/core';
export async function scan(symbols: string[], tf: string) {
  return Promise.all(symbols.map(async sym => {
    try {
      const { bars, source } = await candles(sym, tf, 600);
      const i = bars.length - 1; const sc = confluence(bars)[i];
      const sigs = STRATEGIES.filter(s => s.id !== 'buy_hold').map(s => { const g = s.build(bars); return { id: s.id, name: s.name, side: g.le[i] ? 1 : g.se[i] ? -1 : 0, stop: g.stop[i], target: g.target[i], exitLong: g.lx[i] }; }).filter(x => x.side !== 0);
      return { symbol: sym, tf, source, close: bars[i].c, time: bars[i].t, confluence: sc, signals: sigs };
    } catch (e: any) { return { symbol: sym, tf, error: e.message }; }
  }));
}
export async function runBacktest(sym: string, tf: string, id: string, risk = 0.01, limit = 1500) {
  const { bars, source } = await candles(sym, tf, limit);
  const s = STRATEGIES.find(x => x.id === id); if (!s) throw new Error(`unknown strategy ${id}`);
  const r = backtest(bars, s.build(bars), { risk });
  return { symbol: sym, tf, source, strategy: id, metrics: r.metrics, monteCarlo: monteCarlo(r.trades, risk), trades: r.trades.slice(-50), bars: bars.length };
}
export async function leaderboard(sym: string, tf: string, risk = 0.01) {
  const { bars, source } = await candles(sym, tf, 1500);
  const rows = STRATEGIES.map(s => { const r = backtest(bars, s.build(bars), { risk }); return { id: s.id, name: s.name, ...r.metrics, mc: monteCarlo(r.trades, risk) }; });
  return { symbol: sym, tf, source, rows: rows.sort((a, b) => b.totalReturn / Math.max(0.01, -b.maxDrawdown) - a.totalReturn / Math.max(0.01, -a.maxDrawdown)) };
}
