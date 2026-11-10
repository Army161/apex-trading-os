// Saved strategies (from the AI builder or the editor), their deployments, and paper results since deploy.
// Paper results are recomputed from exchange candles with the same engine as the backtests, so they cost nothing to keep
// running and can't drift from the rules. "Live" mode only flags the strategy for the local runner; the dashboard never sends orders.
import { getJSON, setJSON, push } from './store';
import { candles } from './market';
import { backtest, monteCarlo, Bar, Trade } from './engine/core';
import { Spec, compile, validate } from './engine/spec';

export type Deployment = { status: 'running' | 'paused' | 'stopped'; mode: 'paper' | 'live'; since: number; capital: number; paused: [number, number | null][]; stoppedAt?: number; lastSignalT?: number };
export type Saved = { id: string; spec: Spec; createdAt: number; updatedAt: number; origin: 'ai' | 'manual' | 'example'; prompt?: string; deployment?: Deployment;
  review?: { ts: number; model: string; specKey: string; verdict: 'ok' | 'concerns' | 'block'; summary: string; issues: { severity: string; issue: string; fix: string }[] } };
export const specKey = (sp: Spec) => JSON.stringify(sp);
export const putStrategy = (s: Saved) => put(s);

const TF_MS: Record<string, number> = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
const FEE = 0.001;

export const allStrategies = async () => Object.values(await getJSON<Record<string, Saved>>('strategies', {})).sort((a, b) => b.updatedAt - a.updatedAt);
export const getStrategy = async (id: string) => (await getJSON<Record<string, Saved>>('strategies', {}))[id];
async function put(s: Saved) { const all = await getJSON<Record<string, Saved>>('strategies', {}); all[s.id] = s; await setJSON('strategies', all); return s; }
export async function removeStrategy(id: string) { const all = await getJSON<Record<string, Saved>>('strategies', {}); delete all[id]; await setJSON('strategies', all); }

export async function saveStrategy(spec: Spec, origin: Saved['origin'], prompt?: string, id?: string) {
  const errs = validate(spec); if (errs.length) throw new Error(errs.join('; '));
  const prev = id ? await getStrategy(id) : undefined;
  const now = Date.now();
  return put({ id: prev?.id ?? `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${now.toString(36)}`, spec, origin: prev?.origin ?? origin, prompt: prev?.prompt ?? prompt,
    createdAt: prev?.createdAt ?? now, updatedAt: now, deployment: prev?.deployment });
}

export async function control(id: string, action: 'deploy' | 'pause' | 'resume' | 'stop' | 'mode', mode?: 'paper' | 'live') {
  const s = await getStrategy(id); if (!s) throw new Error('strategy not found');
  const now = Date.now(), d = s.deployment;
  if (action === 'deploy') s.deployment = { status: 'running', mode: 'paper', since: now, capital: 10000, paused: [] };
  else if (!d) throw new Error('deploy it first');
  else if (action === 'pause' && d.status === 'running') { d.status = 'paused'; d.paused.push([now, null]); }
  else if (action === 'resume' && d.status === 'paused') { d.status = 'running'; d.paused[d.paused.length - 1][1] = now; }
  else if (action === 'stop') { if (d.status === 'paused') d.paused[d.paused.length - 1][1] = now; d.status = 'stopped'; d.stoppedAt = now; }
  else if (action === 'mode' && mode) {
    // Second-model gate (archive/chat/31): flagging live needs a fresh second opinion on these exact rules that did not block.
    const r = s.review;
    if (mode === 'live' && (!r || r.specKey !== specKey(s.spec) || now - r.ts > 7 * 864e5)) throw new Error('Get a second opinion on the current rules first (Second opinion button). It is required before flagging live.');
    if (mode === 'live' && r!.verdict === 'block') throw new Error(`The second opinion blocked this: ${r!.summary}`);
    d.mode = mode;
  }
  s.updatedAt = now; await put(s);
  await push('events', { ts: now, bot: `strategy:${id}`, level: 'control', message: `${s.spec.name}: ${action}${mode ? ` ${mode}` : ''}` });
  return s;
}

const isPaused = (d: Deployment, t: number) => d.paused.some(([a, b]) => t >= a && (b == null || t < b));

/** Backtest on history + paper results since deploy (entries only while running, "exit all" closes at the stop time). */
export async function evaluate(s: Saved, limit = 1000) {
  const tfms = TF_MS[s.spec.tf] ?? 864e5, d = s.deployment;
  const need = d ? Math.ceil((Date.now() - d.since) / tfms) + 400 : 0;
  const { bars, source } = await candles(s.spec.symbol, s.spec.tf, Math.min(5000, Math.max(limit, need)));
  const build = compile(s.spec);
  const hist = backtest(bars, build(bars));
  const out: any = { source, bars: bars.slice(-300), history: { metrics: hist.metrics, monteCarlo: monteCarlo(hist.trades), trades: hist.trades.slice(-40) } };
  if (!d) return out;
  out.paper = paperRecord(bars, s.spec, d);
  return out;
}

/** Paper record since deploy: entries only while running, open position marked to the last close, 'stop' = exit all at stop time. */
export function paperRecord(bars: Bar[], spec: Spec, d: Deployment) {
  const until = d.stoppedAt ?? Infinity;
  const win = bars.filter(b => b.t <= until);
  const sig = compile(spec)(win);
  win.forEach((b, i) => { if (b.t < d.since || isPaused(d, b.t)) { sig.le[i] = false; sig.se[i] = false; } });
  const r = backtest(win, sig, { capital: d.capital });
  const trades = r.trades.filter(t => t.entryT >= d.since);
  const openT = d.status !== 'stopped' ? trades.find(t => t.reason === 'end') : undefined;
  const closed = trades.filter(t => t !== openT);
  const realized = closed.reduce((a, t) => a + t.pnl, 0);
  const last = win[win.length - 1];
  const unrealized = openT ? (last.c - openT.entry) * openT.qty * openT.side - FEE * openT.entry * openT.qty : 0;
  const fees = closed.reduce((a, t) => a + FEE * (t.entry + t.exit) * t.qty, 0) + (openT ? FEE * openT.entry * openT.qty : 0);
  const i0 = win.findIndex(b => b.t >= d.since);
  const equity = i0 < 0 ? [] : win.slice(i0).map((b, k) => ({ t: b.t, v: r.equity[i0 + k] }));
  return { since: d.since, status: d.status, mode: d.mode, realized, unrealized, net: realized + unrealized, fees, fills: closed.length * 2 + (openT ? 1 : 0),
    closed: closed.length, wins: closed.filter(t => t.pnl > 0).length, winRate: closed.length ? closed.filter(t => t.pnl > 0).length / closed.length : 0,
    open: openT ? { side: openT.side, entry: openT.entry, stop: openT.stop, target: openT.target, qty: openT.qty, entryT: openT.entryT, mark: last.c } : null,
    trades: trades.slice(-50), equity, lastBar: last.t, lastClose: last.c };

}

export function latestSignal(bars: Bar[], s: Spec) {
  const g = compile(s)(bars), i = bars.length - 1;
  return { t: bars[i].t, close: bars[i].c, side: g.le[i] ? 1 : g.se[i] ? -1 : 0, stop: g.stop[i], target: g.target[i], exitLong: g.lx[i], exitShort: g.sx[i] };
}
export type { Trade };
