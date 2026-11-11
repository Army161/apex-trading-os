'use client';
// The screens that existed before the app shell, moved out of the one-file App so each can sit on its own route
// (docs/design/07 s10). Their content is unchanged here; they are restyled with the shared components one at a time.
import { useVoice, VoiceButtons } from './voice';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ApiKeys from './ApiKeys';
import { STRATEGIES, confluence } from '@/lib/engine/strategies';
import { backtest, monteCarlo, Bar } from '@/lib/engine/core';
import { SOURCES } from '@/lib/sources';

const Chart = dynamic(() => import('./Chart'), { ssr: false });
const pct = (x?: number, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
const num = (x?: number, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: d }));
const ago = (t?: number) => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; return s < 90 ? `${Math.round(s)}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };
const SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT'];
const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

/** The dashboard's own state (bots, trades, events, which settings are present), refreshed every 15 seconds. */
export function useBots() {
  const [state, setState] = useState<any>(null);
  const load = useCallback(() => fetch('/api/bots', { cache: 'no-store' }).then(r => r.json()).then(setState).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  return { state, load };
}

export function Command({ s, reload }: { s: any; reload: () => void }) {
  if (!s) return <div className="card">Loading…</div>;
  const live = s.bots.filter((b: any) => b.lastSeen && Date.now() - b.lastSeen < 15 * 60e3);
  const eq = s.bots.reduce((a: number, b: any) => a + (Number(b.status?.equity) || 0), 0);
  const closed = s.trades.filter((t: any) => typeof t.pnl === 'number');
  const pnl = closed.reduce((a: number, t: any) => a + t.pnl, 0);
  const today = closed.filter((t: any) => Date.now() - t.ts < 864e5).reduce((a: number, t: any) => a + t.pnl, 0);
  const cooldown = s.risk?.lastLossAt && Date.now() - s.risk.lastLossAt < 60 * 60e3;
  const cmd = async (id: string, command: string) => { const r = await post(`/api/bots/${id}/command`, { command }); if (r.error) alert(r.error); reload(); };
  const kill = async () => { if (!s.killed && !confirm('Tell every bot to pause now?')) return; const r = await post('/api/killswitch', { on: !s.killed }); if (r.error) alert(r.error); reload(); };
  return (<>
    {cooldown && <div className="banner warn">Cooldown: a bot closed a losing trade {ago(s.risk.lastLossAt)}. The psychology rules say no new discretionary trades for 60 minutes{s.risk.lossesInRow >= 3 ? ', and you have 3+ losses in a row, so stop for the day' : ''}.</div>}
    <div className="grid g4">
      <div className="card"><div className="k">Bots reporting</div><div className="v">{live.length} / {s.bots.length}</div></div>
      <div className="card"><div className="k">Paper equity (reported)</div><div className="v">${num(eq, 0)}</div></div>
      <div className="card"><div className="k">Realised P&L, 24h</div><div className={`v ${today >= 0 ? 'pos' : 'neg'}`}>${num(today)}</div></div>
      <div className="card"><div className="k">Realised P&L, all</div><div className={`v ${pnl >= 0 ? 'pos' : 'neg'}`}>${num(pnl)}</div><div className="mute">{closed.length} closed trades</div></div>
    </div>
    <div className="row" style={{ margin: '16px 0' }}><button className="btn danger" onClick={kill}>{s.killed ? 'Release kill switch' : 'KILL SWITCH: pause every bot'}</button><span className="mute">Bots poll for commands each cycle. Nothing here can move funds.</span></div>
    <div className="grid g2">
      {s.bots.map((b: any) => {
        const on = b.lastSeen && Date.now() - b.lastSeen < 15 * 60e3; const st = b.status ?? {};
        return <div className="card" key={b.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}><span className={`dot ${on ? 'on' : ''}`} /> {b.name}</h3><span className={`badge ${on ? 'live' : ''}`}>{b.mode}</span></div>
          <div className="mute" style={{ margin: '6px 0' }}>Last heartbeat {ago(b.lastSeen)} · from {b.source}</div>
          {on ? <div className="mono" style={{ maxHeight: 90, overflow: 'auto' }}>{Object.entries(st).filter(([, v]) => typeof v !== 'object').slice(0, 8).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}</div>
            : <div className="mono mute">Not connected. Start it with: {b.run}</div>}
          {st.paused && <div className="warn">Paused{st.pause_reason ? `: ${st.pause_reason}` : ''}</div>}
          <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => cmd(b.id, 'pause')}>Pause</button><button className="btn" onClick={() => cmd(b.id, 'resume')}>Resume</button><button className="btn" onClick={() => confirm(`Stop ${b.name}?`) && cmd(b.id, 'kill')}>Stop</button></div>
        </div>;
      })}
    </div>
    <div className="grid g2" style={{ marginTop: 14 }}>
      <div className="card"><h3>Recent trades</h3><div className="tbl"><table><thead><tr><th>Time</th><th>Bot</th><th>Symbol</th><th>Side</th><th>Status</th><th>P&L</th></tr></thead><tbody>
        {s.trades.slice(0, 25).map((t: any, i: number) => <tr key={i}><td>{new Date(t.ts).toLocaleString()}</td><td>{t.bot}</td><td>{t.symbol ?? t.title ?? t.tokenId?.slice(0, 8)}</td><td>{t.side === 1 ? 'long' : t.side === -1 ? 'short' : t.side}</td><td>{t.status}</td><td className={t.pnl > 0 ? 'pos' : t.pnl < 0 ? 'neg' : ''}>{t.pnl != null ? num(t.pnl) : ''}</td></tr>)}
        {!s.trades.length && <tr><td colSpan={6} className="mute">No trades reported yet.</td></tr>}</tbody></table></div></div>
      <div className="card"><h3>Event feed</h3><div style={{ maxHeight: 360, overflow: 'auto' }}>{s.events.map((e: any, i: number) => <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span className="mono mute">{new Date(e.ts).toLocaleTimeString()}</span> <span className={`badge ${e.level === 'error' ? 'off' : ''}`}>{e.level}</span> <b>{e.bot}</b> {String(e.message).slice(0, 220)}</div>)}
        {!s.events.length && <div className="mute">Quiet. Errors, blocked trades, alerts and proposals show up here.</div>}</div></div>
    </div>
  </>);
}

function useCandles(sym: string, tf: string, limit = 1500) {
  const [d, setD] = useState<{ bars: Bar[]; source: string } | null>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); fetch(`/api/candles?symbol=${sym}&tf=${tf}&limit=${limit}`).then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(e => setErr(String(e))); }, [sym, tf, limit]);
  return { d, err };
}

export function Lab() {
  const [sym, setSym] = useState('BTCUSDT'); const [tf, setTf] = useState('1d'); const [sid, setSid] = useState('turtle_55_20'); const [risk, setRisk] = useState(1);
  const { d, err } = useCandles(sym, tf);
  const run = useMemo(() => { if (!d) return null; const s = STRATEGIES.find(x => x.id === sid)!; const r = backtest(d.bars, s.build(d.bars), { risk: risk / 100 }); return { ...r, mc: monteCarlo(r.trades, risk / 100) }; }, [d, sid, risk]);
  const board = useMemo(() => d ? STRATEGIES.map(s => ({ s, m: backtest(d.bars, s.build(d.bars), { risk: risk / 100 }).metrics })).sort((a, b) => b.m.totalReturn / Math.max(0.01, -b.m.maxDrawdown) - a.m.totalReturn / Math.max(0.01, -a.m.maxDrawdown)) : [], [d, risk]);
  const strat = STRATEGIES.find(x => x.id === sid)!;
  const lines = useMemo(() => run && d ? [{ name: 'Strategy', color: '#2fd59b', data: run.equity.map((v, i) => ({ t: d.bars[i].t, v })) }, { name: 'Buy & hold', color: '#6ea8ff', data: d.bars.map(b => ({ t: b.t, v: 10000 * b.c / d.bars[0].c })) }] : [], [run, d]);
  const markers = useMemo(() => run ? run.trades.flatMap(t => [{ time: t.entryT, position: t.side === 1 ? 'belowBar' : 'aboveBar', color: '#2fd59b', shape: t.side === 1 ? 'arrowUp' : 'arrowDown', text: '' }, { time: t.exitT, position: 'aboveBar', color: t.pnl > 0 ? '#2fd59b' : '#ff6b6b', shape: 'circle', text: t.reason }]) : [], [run]);
  const m = run?.metrics;
  return (<>
    <div className="card row" style={{ marginBottom: 14 }}>
      <select value={sym} onChange={e => setSym(e.target.value)}>{SYMS.map(s => <option key={s}>{s}</option>)}</select>
      <select value={tf} onChange={e => setTf(e.target.value)}>{['1h', '4h', '1d', '1w'].map(s => <option key={s}>{s}</option>)}</select>
      <select value={sid} onChange={e => setSid(e.target.value)}>{STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <label className="row">Risk/trade <input type="number" min={0.25} max={5} step={0.25} value={risk} onChange={e => setRisk(+e.target.value)} style={{ width: 70 }} />%</label>
      <span className="mute">{d ? `${d.bars.length} live bars from ${d.source}` : err ? '' : 'loading candles…'}</span>
    </div>
    {err && <div className="banner bad">{err}</div>}
    <div className="banner">{strat.desc} <span className="mute">Source: {strat.source}. Fills at next open, 0.1% fee + 0.05% slippage each side, stop checked before target. Results are historical, not a promise.</span></div>
    {m && <div className="grid g4">
      <div className="card"><div className="k">Return</div><div className={`v ${m.totalReturn >= 0 ? 'pos' : 'neg'}`}>{pct(m.totalReturn)}</div><div className="mute">Buy & hold {pct(m.buyHold)}</div></div>
      <div className="card"><div className="k">Max drawdown</div><div className="v neg">{pct(m.maxDrawdown)}</div><div className="mute">Buy & hold {pct(m.buyHoldDD)}</div></div>
      <div className="card"><div className="k">Trades · win rate</div><div className="v">{m.trades} · {pct(m.winRate, 0)}</div><div className="mute">PF {num(m.profitFactor)} · avg {num(m.avgR)}R · worst streak {m.maxLosingStreak}</div></div>
      <div className="card"><div className="k">Monte Carlo (1,000 reshuffles)</div><div className="v">{pct(run?.mc?.retMedian)}</div><div className="mute">5–95%: {pct(run?.mc?.ret5)} to {pct(run?.mc?.ret95)} · 1-in-20 DD {pct(run?.mc?.ddWorst5)} · P(loss) {pct(run?.mc?.probLoss, 0)}</div></div>
    </div>}
    {d && <div className="card" style={{ marginTop: 14 }}><h3>Equity vs buy & hold ($10,000 start)</h3><Chart lines={lines} height={260} /></div>}
    {d && <div className="card" style={{ marginTop: 14 }}><h3>Trades on the chart (last 300 bars)</h3><Chart candles={d.bars.slice(-300)} markers={markers.filter(x => x.time >= d.bars[Math.max(0, d.bars.length - 300)].t)} height={340} /></div>}
    <div className="card" style={{ marginTop: 14 }}><h3>Leaderboard on {sym} {tf}: every strategy, ranked by return per drawdown</h3><div className="tbl"><table><thead><tr><th>Strategy</th><th>Return</th><th>Max DD</th><th>Trades</th><th>Win</th><th>PF</th><th>vs B&H</th></tr></thead><tbody>
      {board.map(({ s, m }) => <tr key={s.id} onClick={() => setSid(s.id)} style={{ cursor: 'pointer' }}><td>{s.name}</td><td className={m.totalReturn >= 0 ? 'pos' : 'neg'}>{pct(m.totalReturn)}</td><td>{pct(m.maxDrawdown)}</td><td>{m.trades}</td><td>{pct(m.winRate, 0)}</td><td>{num(m.profitFactor)}</td><td>{pct(m.totalReturn - m.buyHold)}</td></tr>)}
    </tbody></table></div><div className="mute" style={{ marginTop: 8 }}>The browser lab runs 12 strategies. The Python engine runs all 22 with walk-forward (out-of-sample) testing: <code>python -m apex_engine discover --symbol {sym} --tf {tf}</code></div></div>
  </>);
}

export function Signals() {
  const [tf, setTf] = useState('1d'); const [res, setRes] = useState<any[] | null>(null);
  useEffect(() => { setRes(null); fetch(`/api/signals?symbols=${SYMS.join(',')}&tf=${tf}`).then(r => r.json()).then(j => setRes(j.results ?? [])); }, [tf]);
  return (<>
    <div className="card row" style={{ marginBottom: 14 }}><b>Live scanner</b><select value={tf} onChange={e => setTf(e.target.value)}>{['1h', '4h', '1d', '1w'].map(s => <option key={s}>{s}</option>)}</select><span className="mute">Signals on the last closed candle. Confluence = 5-step checklist from the technical analysis course.</span></div>
    {!res && <div className="card">Scanning {SYMS.length} markets…</div>}
    <div className="grid g2">{res?.map(r => r.error ? <div className="card" key={r.symbol}><h3>{r.symbol}</h3><div className="neg">{r.error}</div></div> :
      <div className="card" key={r.symbol}>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{r.symbol}</h3><span className="mono">{num(r.close, 4)}</span></div>
        {(['long', 'short'] as const).map(side => { const sc = r.confluence[side]; const parts = r.confluence[side === 'long' ? 'L' : 'S'];
          return <div key={side} style={{ marginTop: 8 }}><div className="row" style={{ justifyContent: 'space-between' }}><span>{side} confluence</span><b className={sc >= 60 ? (side === 'long' ? 'pos' : 'neg') : ''}>{sc}/100</b></div>
            <div className="bar"><i style={{ width: `${sc}%`, background: side === 'short' ? 'var(--bad)' : undefined }} /></div>
            <div className="mute mono">{Object.entries(parts).map(([k, v]) => `${k} ${v}`).join(' · ')}</div></div>; })}
        <div style={{ marginTop: 10 }}>{r.signals.length ? r.signals.map((g: any) => <div key={g.id} className="row"><span className={`badge ${g.side === 1 ? 'live' : 'off'}`}>{g.side === 1 ? 'LONG' : 'SHORT'}</span>{g.name}<span className="mute mono">stop {num(g.stop, 4)}{Number.isFinite(g.target) ? ` · target ${num(g.target, 4)}` : ''}</span></div>) : <span className="mute">No strategy fires on this candle. No trade is a position too.</span>}</div>
      </div>)}</div>
  </>);
}

const EMOTIONS = ['calm', 'confident', 'fomo', 'fear', 'greed', 'revenge', 'bored', 'tired', 'impatient'];
export function Journal({ risk }: { risk?: any }) {
  const [entries, setEntries] = useState<any[]>([]);
  const blank = { symbol: '', setup: 'turtle_55_20', side: 'long', entry: '', stop: '', target: '', exit: '', emotions: [] as string[], followedPlan: true, notes: '' };
  const [f, setF] = useState<any>(blank);
  const load = () => fetch('/api/journal').then(r => r.json()).then(j => setEntries(j.entries));
  useEffect(() => { load(); }, []);
  const r = (e: any) => { const en = +e.entry, st = +e.stop, ex = +e.exit; if (!en || !st || !ex) return null; const d = Math.abs(en - st); return d ? ((ex - en) * (e.side === 'long' ? 1 : -1)) / d : null; };
  const planR = f.entry && f.stop && f.target ? Math.abs(+f.target - +f.entry) / Math.abs(+f.entry - +f.stop) : null;
  const save = async () => {
    if (!f.entry || !f.stop || !f.target) return alert('Psychology rule: write entry, stop and target BEFORE the trade.');
    const res = await post('/api/journal', { ...f, r: r(f) }); if (res.error) return alert(res.error); setF(blank); load();
  };
  const byEmotion = useMemo(() => { const m: Record<string, number[]> = {}; for (const e of entries) for (const em of e.emotions ?? []) if (e.r != null) (m[em] ??= []).push(e.r); return Object.entries(m).map(([k, v]) => ({ k, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => a.avg - b.avg); }, [entries]);
  const plan = useMemo(() => { const a = entries.filter(e => e.r != null); const f1 = a.filter(e => e.followedPlan), f0 = a.filter(e => !e.followedPlan); const av = (x: any[]) => x.length ? x.reduce((s, e) => s + e.r, 0) / x.length : NaN; return { followed: av(f1), broke: av(f0), n1: f1.length, n0: f0.length }; }, [entries]);
  const recentLoss = entries.find(e => e.r != null && e.r < 0 && Date.now() - e.ts < 60 * 60e3) || (risk?.lastLossAt && Date.now() - risk.lastLossAt < 60 * 60e3);
  return (<>
    {recentLoss && <div className="banner warn">Cooldown active: you logged a loss in the last hour. Step away before the next trade (revenge trading is the costliest emotion in most journals).</div>}
    <div className="grid g2">
      <div className="card"><h3>Plan the trade (before you enter)</h3>
        <div className="row"><input placeholder="Symbol" value={f.symbol} onChange={e => setF({ ...f, symbol: e.target.value.toUpperCase() })} style={{ width: 110 }} />
          <select value={f.setup} onChange={e => setF({ ...f, setup: e.target.value })}>{STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="discretionary">Discretionary</option></select>
          <select value={f.side} onChange={e => setF({ ...f, side: e.target.value })}><option>long</option><option>short</option></select></div>
        <div className="row" style={{ marginTop: 8 }}>{['entry', 'stop', 'target', 'exit'].map(k => <input key={k} placeholder={k} type="number" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={{ width: 100 }} />)}</div>
        <div className="mute" style={{ margin: '6px 0' }}>Planned R:R {planR ? planR.toFixed(2) : '–'}{planR != null && planR < 1.5 ? ' (below 1.5: the risk courses say skip it)' : ''}{f.exit ? ` · result ${r(f)?.toFixed(2)}R` : ''}</div>
        <div className="row">{EMOTIONS.map(em => <button key={em} className="btn" style={f.emotions.includes(em) ? { borderColor: 'var(--acc)', color: 'var(--acc)' } : {}} onClick={() => setF({ ...f, emotions: f.emotions.includes(em) ? f.emotions.filter((x: string) => x !== em) : [...f.emotions, em] })}>{em}</button>)}</div>
        <label className="row" style={{ margin: '8px 0' }}><input type="checkbox" checked={f.followedPlan} onChange={e => setF({ ...f, followedPlan: e.target.checked })} /> I followed my plan</label>
        <textarea placeholder="What did you see? What would you do differently?" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3} style={{ width: '100%' }} />
        <div style={{ marginTop: 8 }}><button className="btn pri" onClick={save}>Save to journal</button></div></div>
      <div className="card"><h3>What your emotions cost you</h3>
        {byEmotion.length ? <table><thead><tr><th>Emotion</th><th>Trades</th><th>Avg R</th></tr></thead><tbody>{byEmotion.map(x => <tr key={x.k}><td>{x.k}</td><td>{x.n}</td><td className={x.avg >= 0 ? 'pos' : 'neg'}>{x.avg.toFixed(2)}R</td></tr>)}</tbody></table> : <div className="mute">Log a few closed trades with emotion tags and this panel shows which states make or lose you money.</div>}
        <div style={{ marginTop: 12 }}><b>Plan discipline:</b> followed {Number.isFinite(plan.followed) ? plan.followed.toFixed(2) : '–'}R avg over {plan.n1} trades · broke plan {Number.isFinite(plan.broke) ? plan.broke.toFixed(2) : '–'}R over {plan.n0}</div></div>
    </div>
    <div className="card" style={{ marginTop: 14 }}><h3>Journal</h3><div className="tbl"><table><thead><tr><th>Date</th><th>Symbol</th><th>Setup</th><th>Side</th><th>Entry</th><th>Stop</th><th>Target</th><th>Exit</th><th>R</th><th>Emotions</th><th>Plan</th><th></th></tr></thead><tbody>
      {entries.map(e => <tr key={e.id}><td>{new Date(e.ts).toLocaleDateString()}</td><td>{e.symbol}</td><td>{e.setup}</td><td>{e.side}</td><td>{e.entry}</td><td>{e.stop}</td><td>{e.target}</td><td>{e.exit}</td><td className={e.r > 0 ? 'pos' : e.r < 0 ? 'neg' : ''}>{e.r != null ? e.r.toFixed(2) : 'open'}</td><td>{(e.emotions ?? []).join(', ')}</td><td>{e.followedPlan ? '✓' : '✗'}</td><td><button className="btn" onClick={() => post('/api/journal', { delete: e.id }).then(load)}>×</button></td></tr>)}
    </tbody></table></div></div>
  </>);
}

export function Council() {
  const [p, setP] = useState<any[]>([]);
  const load = () => fetch('/api/proposals').then(r => r.json()).then(j => setP(j.proposals));
  useEffect(() => { load(); }, []);
  const decide = async (x: any, decision: string) => { const r = await post('/api/proposals', { key: `${x.ts}:${x.symbol}`, decision }); if (r.error) alert(r.error); load(); };
  return (<>
    <div className="banner">The AI Research Council (bots/research-council) has two desks: the debate desk (analysts, bull vs bear, risk manager, portfolio manager) and the analyst team (web discovery, 5 analysts scored 0-100, optional value/growth/macro lenses, a 3-target plan and a risk matrix, saved as a Markdown report). Its output is a proposal only: approving it records your decision, and the trade itself stays manual in the bot that owns the account.</div>
    <div className="grid g2">{p.map((x, i) => <div className="card" key={i}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{x.symbol} {x.tf}</h3><span className={`badge ${x.action === 'BUY' ? 'live' : x.action === 'SELL' ? 'off' : ''}`}>{x.action}</span></div>
      <div className="mono mute">{new Date(x.ts).toLocaleString()} · confidence {pct(x.confidence, 0)}</div>
      {x.score && <div className="row" style={{ margin: '6px 0' }}><b>Team score {x.score.score}/100</b><span className="mute">{x.score.grade}</span>{Object.entries(x.score.parts ?? {}).map(([k, v]: any) => <span key={k} className="badge">{k} {v}</span>)}</div>}
      <p>{x.thesis}</p>{x.action !== 'HOLD' && <div className="mono">entry {num(x.entry)} · stop {num(x.stop)} · {x.targets ? `targets ${x.targets.map((t: number) => num(t)).join(' / ')}` : `target ${x.target}`}</div>}
      <div className="mute">Invalidation: {x.invalidation}</div>{x.overridden && <div className="warn">{x.overridden}</div>}
      <div className="row" style={{ marginTop: 10 }}>{x.status === 'pending' ? <><button className="btn pri" onClick={() => decide(x, 'approved')}>Approve</button><button className="btn" onClick={() => decide(x, 'rejected')}>Reject</button></> : <span className="badge">{x.status}</span>}</div>
    </div>)}{!p.length && <div className="card mute">No proposals yet. Run <code>python bots/research-council/analyst_team.py analyze BTCUSDT</code> or <code>council.py BTCUSDT</code> with APEX_DASHBOARD_URL set.</div>}</div>
  </>);
}

export function Ai({ enabled }: { enabled?: boolean }) {
  const [msgs, setMsgs] = useState<{ role: string; content: string; tools?: string[] }[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const v = useVoice();
  const ask = async (text: string) => {
    if (!text.trim()) return; const next = [...msgs, { role: 'user', content: text }]; setMsgs(next); setQ(''); setBusy(true);
    try { const r = await post('/api/chat', { messages: next.map(({ role, content }) => ({ role, content })) }); setMsgs([...next, { role: 'assistant', content: r.reply ?? r.error, tools: r.tools }]); v.speak(r.reply ?? ''); }
    catch (e: any) { setMsgs([...next, { role: 'assistant', content: `Error: ${e.message}` }]); } finally { setBusy(false); }
  };
  const ideas = ['Which strategy has the best return per drawdown on ETHUSDT daily?', 'Scan BTC, ETH and SOL on 4h. Anything worth a trade?', 'How are my bots doing? Any errors?', 'Which emotions cost me the most in my journal?', 'Which course did the Wyckoff strategy come from?'];
  return (<div className="card">
    {!enabled && <div className="banner warn">Add ANTHROPIC_API_KEY to the Vercel environment to switch on Apex AI.</div>}
    <div className="chat">{msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'u' : ''}`}>{m.content}{m.tools?.length ? <div className="mute mono" style={{ marginTop: 6 }}>used: {m.tools.join(', ')}</div> : null}</div>)}
      {!msgs.length && <div className="row">{ideas.map(x => <button key={x} className="btn" onClick={() => ask(x)}>{x}</button>)}</div>}{busy && <div className="mute">Apex is checking live data…</div>}</div>
    <div className="row" style={{ marginTop: 12 }}><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)} placeholder="Ask about your bots, signals, backtests or the course library" style={{ flex: 1, minWidth: 200 }} /><button className="btn pri" disabled={busy} onClick={() => ask(q)}>Ask</button><VoiceButtons v={v} onText={t => ask(t)} /></div>
  </div>);
}

export function Library() {
  const [q, setQ] = useState('');
  const rows = SOURCES.filter(s => JSON.stringify(s).toLowerCase().includes(q.toLowerCase()));
  return (<div className="card"><div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Source library: every transcript and guide, and what it became</h3><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>
    <p className="mute">All {SOURCES.length} sources are archived word for word in <code>archive/</code>, with rule extractions in <code>archive/notes/</code>.</p>
    <div className="tbl"><table><thead><tr><th>#</th><th>Source</th><th>Feeds</th><th>File</th></tr></thead><tbody>{rows.map(s => <tr key={s.id}><td className="mono">{s.id}</td><td>{s.title}</td><td style={{ whiteSpace: 'normal' }}>{s.feeds}</td><td className="mono mute">{s.file}</td></tr>)}</tbody></table></div></div>);
}

export function Setup({ s }: { s: any }) {
  const [origin, setOrigin] = useState(''); useEffect(() => setOrigin(window.location.origin), []);   // set after mount, so the server and the browser render the same first page
  const ok = (b?: boolean) => <span className={`badge ${b ? 'live' : 'off'}`}>{b ? 'set' : 'missing'}</span>;
  return (<div className="grid g2">
    <SystemMap />
    <div className="card"><h3>Environment (Vercel project settings)</h3><table className="wrap"><tbody>
      <tr><td>Storage (Upstash Redis via Marketplace)</td><td>{ok(s?.persistent)}</td></tr>
      <tr><td>APEX_INGEST_TOKEN (bots authenticate; while missing, bot reports are refused)</td><td>{ok(s?.ingestTokenSet)}</td></tr>
      <tr><td>APEX_ADMIN_PASSWORD (controls need login; while missing, the controls are refused)</td><td>{ok(s?.authEnabled)}</td></tr>
      <tr><td>ANTHROPIC_API_KEY (Apex AI chat + strategy builder)</td><td>{ok(s?.aiEnabled)}</td></tr>
      <tr><td>TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (trade alerts, /positions /orders /pnl)</td><td>{ok(s?.telegramOn)}</td></tr>
      <tr><td>DISCORD_WEBHOOK_URL (optional, briefs to Discord)</td><td>{ok(s?.discordSet)}</td></tr>
      <tr><td>ALPACA_API_KEY_ID + ALPACA_API_SECRET_KEY (stocks in Deal Seeker; paper keys are enough)</td><td>{ok(s?.alpacaSet)}</td></tr>
      <tr><td>CRON_SECRET (morning brief, Deal Seeker, strategy signal checks)</td><td>{ok(s?.cronSecretSet)}</td></tr>
      <tr><td>FRED_API_KEY (optional, free: macro panel on Assistants)</td><td>{ok(s?.fredSet)}</td></tr>
      <tr><td>APEX_AI_DAILY_BUDGET (optional, USD a day, default 5)</td><td><span className="badge">{s?.aiBudget ?? 5}</span></td></tr></tbody></table>
      {s?.authEnabled && <Login />}</div>
    <div className="card"><h3>Connect a bot</h3><p>Every bot reads two env vars on your machine and reports here automatically:</p>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{`APEX_DASHBOARD_URL=${origin}\nAPEX_INGEST_TOKEN=<same value as in Vercel>`}</pre>
      <p className="mute">Exchange, wallet and broker keys stay in each bot's local .env. They are never sent here and Apex never asks for them in chat.</p></div>
    <div className="card"><h3>Telegram alerts and commands</h3><ol>
      <li>In Telegram, message @BotFather, send /newbot, and copy the token it gives you.</li>
      <li>Send your new bot any message, then open <span className="mono">api.telegram.org/bot&lt;token&gt;/getUpdates</span> and copy <span className="mono">chat.id</span>.</li>
      <li>In Vercel env vars set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and a random TELEGRAM_WEBHOOK_SECRET, then redeploy.</li>
      <li>Register the webhook once: <span className="mono" style={{ wordBreak: 'break-all' }}>{`curl "https://api.telegram.org/bot<token>/setWebhook?url=${origin}/api/telegram&secret_token=<secret>"`}</span></li></ol>
      <p>Then you get a message for every bot trade, risk event and new strategy signal, and the bot answers /positions, /orders, /pnl, /strategies and /bots. It only answers your chat id.</p>
      <p className="mute">Strategy signal checks run from /api/cron/strategies (set CRON_SECRET). Vercel Hobby runs it once a day; for 15m or 1h strategies point a free pinger like cron-job.org at it with the header <span className="mono">Authorization: Bearer &lt;CRON_SECRET&gt;</span>.</p>
      <p className="mute">Why there are no key forms on this page: broker, wallet, AI and Telegram keys live in Vercel or your machine's .env, never in the app's database, so a leaked dashboard login can't leak a key.</p></div>
    <Spend />
    <ApiKeys />
    <div className="card"><h3>Safety rails built in</h3><ul>
      <li>Every bot starts in paper, dry-run or watch mode. Going live needs a second explicit switch on your machine.</li>
      <li>1% risk per trade, minimum 1.5–2R, entry/stop/target required before any order.</li>
      <li>Cooldown after a loss, a daily loss limit, and auto-pause when drawdown passes the backtest's worst.</li>
      <li>Kill switch pauses every bot on its next poll.</li>
      <li>AI spend is estimated on every call: a Telegram alert at the daily budget, and AI pauses until tomorrow at 2x.</li>
      <li>Giving an AI tool (Claude desktop, the Apex MCP server, a local assistant) access to your computer? Start with one test folder of sample files, watch what it does, then widen it. Read what each connector asks for: read-only beats read-and-send.</li></ul></div>
  </div>);
}

function Spend() {
  const [u, setU] = useState<any>(null);
  useEffect(() => { fetch('/api/usage', { cache: 'no-store' }).then(r => r.json()).then(setU).catch(() => setU({ days: [] })); }, []);
  const today = u?.days?.[0]?.date === new Date().toISOString().slice(0, 10) ? u.days[0] : null, b = u?.budget ?? 5;
  const week = (u?.days ?? []).slice(0, 7).reduce((x: number, d: any) => x + d.usd, 0);
  return <div className="card"><h3>AI spend (estimate)</h3>
    <div className="row"><div><div className="mute">Today</div><div className="mono" style={{ fontSize: 22 }}>${(today?.usd ?? 0).toFixed(2)}</div></div>
      <div><div className="mute">Last 7 days</div><div className="mono" style={{ fontSize: 22 }}>${week.toFixed(2)}</div></div>
      <div><div className="mute">Daily budget</div><div className="mono" style={{ fontSize: 22 }}>${b}</div></div></div>
    <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, marginTop: 10 }}><div style={{ width: `${Math.min(100, ((today?.usd ?? 0) / (2 * b)) * 100)}%`, height: 8, borderRadius: 4, background: (today?.usd ?? 0) >= b ? 'var(--bad, #e5484d)' : 'var(--accent, #3b82f6)' }} /></div>
    <div className="mute" style={{ marginTop: 6 }}>Bar fills at 2x budget, where AI calls stop for the day.{today ? ` ${today.calls} calls today. Biggest: ${Object.entries(today.byFeature as Record<string, number>).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([f, x]) => `${f} $${x.toFixed(2)}`).join(', ')}.` : ''}</div>
    <p className="mute">Estimated from list prices and web-search counts, so treat it as a guide. Also set a hard monthly limit and an email alert in the Anthropic Console under Billing.</p></div>;
}

function SystemMap() {
  // Plain map of how Apex fits together (idea from archive/chat/31, plain English to architecture). Static SVG, both themes.
  const box = (x: number, y: number, w: number, t: string, sub: string, k = '') => <g key={t}><rect x={x} y={y} width={w} height={46} rx={8} fill="var(--bg)" stroke={k || 'var(--line, #3a4150)'} />
    <text x={x + w / 2} y={y + 19} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">{t}</text><text x={x + w / 2} y={y + 35} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".65">{sub}</text></g>;
  const ln = (x1: number, y1: number, x2: number, y2: number, label = '') => <g><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" opacity=".45" markerEnd="url(#ah)" />{label && <text x={(x1 + x2) / 2 + 4} y={(y1 + y2) / 2 - 4} fontSize="9" fill="currentColor" opacity=".6">{label}</text>}</g>;
  return <div className="card" style={{ gridColumn: '1 / -1' }}><h3>How Apex fits together</h3>
    <div style={{ overflowX: 'auto' }}><svg viewBox="0 0 760 300" style={{ width: '100%', minWidth: 560, height: 'auto' }} role="img" aria-label="Apex system map">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity=".6" /></marker></defs>
      {box(10, 20, 170, 'Your machine', 'bots, runner, keys in .env', '#2fd59b')}
      {box(10, 127, 170, 'Exchanges + Alpaca', 'market candles')}
      {box(10, 234, 170, 'Your phone', 'Telegram / Discord')}
      {box(295, 20, 170, 'Ingest + Store', 'trades, strategies, journal')}
      {box(295, 127, 170, 'Candle hub', 'fetch once, share, cache')}
      {box(295, 234, 170, 'Alerts + bot chat', 'signals, /pnl, questions')}
      {box(580, 20, 170, 'Dashboard', 'every tab you see')}
      {box(580, 127, 170, 'Claude', 'builder, chat, assistants')}
      {box(580, 234, 170, 'Second opinion', 'another model checks live flags', '#f5a524')}
      {ln(180, 43, 295, 43, 'trades, errors')}{ln(465, 43, 580, 43)}
      {ln(180, 150, 295, 150, 'bars')}{ln(465, 150, 580, 150, 'numbers')}
      {ln(380, 127, 380, 66, 'paper P&L')}{ln(380, 173, 380, 234, 'signals')}
      {ln(665, 66, 665, 127, 'asks')}{ln(665, 173, 665, 234, 'plans')}
      {ln(295, 250, 180, 250, 'alerts')}{ln(180, 266, 295, 266, 'questions')}
    </svg></div>
    <div className="mute">Orders never leave this dashboard: only the bots and runner on your machine can trade, with keys that stay there, and they start in paper mode.</div></div>;
}

function Login() {
  const [pw, setPw] = useState(''); const [msg, setMsg] = useState('');
  return <div className="row" style={{ marginTop: 12 }}><input type="password" placeholder="Admin password" value={pw} onChange={e => setPw(e.target.value)} /><button className="btn pri" onClick={async () => { const r = await post('/api/login', { password: pw }); setMsg(r.ok ? 'Logged in' : r.error); }}>Log in</button><span className="mute">{msg}</span></div>;
}
