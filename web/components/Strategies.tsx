'use client';
// Strategies tab (archive/chat/24, Delta terminal): describe a strategy in plain English, Apex AI turns it into rules,
// you check the backtest, save it, tweak the numbers, deploy it to paper, and watch it with a chart and its own stats.
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Spec, knobs, setPath, validate, EXAMPLE } from '@/lib/engine/spec';

const Chart = dynamic(() => import('./Chart'), { ssr: false });
const pct = (x?: number, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
const usd = (x?: number) => (x == null || !Number.isFinite(x) ? '–' : `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const rule = (c: { left: string; op: string; right: string }) => `${c.left} ${c.op.replace('_', ' ')} ${c.right}`;

export default function Strategies({ aiEnabled }: { aiEnabled?: boolean }) {
  const [list, setList] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null);
  const load = () => fetch('/api/strategies', { cache: 'no-store' }).then(r => r.json()).then(j => setList(j.strategies ?? []));
  useEffect(() => { load(); }, []);
  return (<>
    <Builder aiEnabled={aiEnabled} onSaved={id => { load(); setOpen(id); }} />
    <div className="card" style={{ marginTop: 14 }}><h3>My strategies</h3>
      {!list.length ? <div className="mute">Nothing saved yet. Build one above, or save the example from the video.</div> :
        <div className="tbl"><table><thead><tr><th>Name</th><th>Market</th><th>Status</th><th>Mode</th><th>Origin</th><th></th></tr></thead><tbody>
          {list.map(s => <tr key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
            <td><b>{s.spec.name}</b></td><td className="mono">{s.spec.symbol} {s.spec.tf}</td>
            <td><span className={`badge ${s.deployment?.status === 'running' ? 'live' : ''}`}>{s.deployment?.status ?? 'not deployed'}</span></td>
            <td>{s.deployment?.mode ?? '–'}</td><td className="mute">{s.origin}</td><td>{open === s.id ? '▾' : '▸'}</td></tr>)}
        </tbody></table></div>}
    </div>
    {open && <Detail key={open} id={open} onChange={load} onDeleted={() => { setOpen(null); load(); }} />}
  </>);
}

function Builder({ aiEnabled, onSaved }: { aiEnabled?: boolean; onSaved: (id: string) => void }) {
  const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null); const [hist, setHist] = useState<{ role: string; content: string }[]>([]);
  const build = async (refine: boolean) => {
    if (!prompt.trim()) return; setBusy(true);
    try {
      const r = await post('/api/builder', { prompt, current: refine ? res?.spec : undefined, history: refine ? hist : [] });
      setRes(r); setHist(h => [...(refine ? h : []), { role: 'user', content: prompt }, { role: 'assistant', content: JSON.stringify(r.spec ?? r.error) }]); setPrompt('');
    } catch (e: any) { setRes({ error: e.message }); } finally { setBusy(false); }
  };
  const save = async () => { const r = await post('/api/strategies', { action: 'save', spec: res.spec, origin: res.demo ? 'example' : 'ai', prompt: hist[0]?.content }); if (r.error) return alert(r.error); setRes(null); setHist([]); onSaved(r.strategy.id); };
  const s: Spec | undefined = res?.spec; const p = res?.preview;
  const ideas = ['Buy BTC when the 15m candle closes above Supertrend, short when it closes below. 10% stop, 30% target.',
    'ETH 4h: long when EMA 20 crosses above EMA 50 and RSI 14 is above 50. Stop 2x ATR, target 2R.',
    'SOL daily: buy a bullish engulfing candle when price is above the 200 SMA. 5% stop, exit when RSI goes above 70.'];
  return (<div className="card">
    <h3>Build a strategy with Apex AI</h3>
    <div className="mute" style={{ marginBottom: 8 }}>Describe it the way you would to a friend: market, timeframe, entry, stop, target. Apex turns it into rules, checks them, and backtests them before you save anything.</div>
    {!aiEnabled && <div className="banner warn">No ANTHROPIC_API_KEY in the Vercel environment yet, so Build returns the prebuilt Supertrend example from the video. Everything else (save, edit, deploy, stats) works.</div>}
    <textarea rows={3} style={{ width: '100%' }} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={ideas[0]} />
    <div className="row" style={{ marginTop: 8 }}>
      <button className="btn pri" disabled={busy || !prompt.trim()} onClick={() => build(false)}>{busy ? 'Building…' : 'Build'}</button>
      {s && <button className="btn" disabled={busy || !prompt.trim()} onClick={() => build(true)}>Change this one</button>}
      <button className="btn" onClick={() => setRes({ spec: EXAMPLE, demo: true })}>Load the video's example</button>
    </div>
    {!s && !res && <div className="row" style={{ marginTop: 8 }}>{ideas.map(x => <button key={x} className="btn" onClick={() => setPrompt(x)} style={{ textAlign: 'left' }}>{x}</button>)}</div>}
    {res?.error && <div className="banner bad" style={{ marginTop: 10 }}>{res.error}</div>}
    {res?.note && <div className="banner" style={{ marginTop: 10 }}>{res.note}</div>}
    {s && <div style={{ marginTop: 12 }}>
      <SpecView s={s} />
      {res.errors?.length ? <div className="banner bad">These rules don't check out yet: {res.errors.join('; ')}</div> : null}
      {p && (p.error ? <div className="banner warn">Couldn't backtest right now: {p.error}</div> :
        <div className="banner">Backtest on the last {s.tf} candles from {p.source}: return {pct(p.totalReturn)} vs buy & hold {pct(p.buyHold)}, max drawdown {pct(p.maxDrawdown)}, {p.trades} trades, win rate {pct(p.winRate, 0)}. History, not a promise.</div>)}
      {res.fallback && <div className="mute">Served by a fallback model after the first one declined.</div>}
      <button className="btn pri" disabled={!!res.errors?.length || !!validate(s).length} onClick={save}>Save to my strategies</button>
    </div>}
  </div>);
}

function SpecView({ s }: { s: Spec }) {
  return (<div className="card" style={{ background: 'var(--bg)' }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><b>{s.name}</b><span className="mono">{s.symbol} · {s.tf} · {s.direction}</span></div>
    <p>{s.description}</p>
    <div className="mono" style={{ fontSize: 12 }}>
      <div>indicators: {s.indicators.map(i => `${i.id}=${i.type}(${[i.length, i.length2, i.length3].filter(Boolean).join(',')}${i.mult ? `, x${i.mult}` : ''})`).join('  ') || 'none'}</div>
      {s.long_entry.length > 0 && <div>long when ALL: {s.long_entry.map(rule).join(' AND ')}</div>}
      {s.short_entry.length > 0 && <div>short when ALL: {s.short_entry.map(rule).join(' AND ')}</div>}
      {s.exit_long.length > 0 && <div>exit long on ANY: {s.exit_long.map(rule).join(' OR ')}</div>}
      {s.exit_short.length > 0 && <div>exit short on ANY: {s.exit_short.map(rule).join(' OR ')}</div>}
      <div>stop: {s.stop.type === 'pct' ? pct(s.stop.value) : `${s.stop.value}x ATR`} · target: {s.target.type === 'none' ? 'none' : s.target.type === 'pct' ? pct(s.target.value) : `${s.target.value}R`}{s.max_bars ? ` · time exit ${s.max_bars} bars` : ''}</div>
    </div>
    {s.unsupported?.length > 0 && <div className="warn" style={{ marginTop: 6 }}>Not covered: {s.unsupported.join(' ')}</div>}
  </div>);
}

function Detail({ id, onChange, onDeleted }: { id: string; onChange: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<any>(null); const [edit, setEdit] = useState<Spec | null>(null); const [rules, setRules] = useState(false); const [reviewing, setReviewing] = useState(false);
  const load = () => fetch(`/api/strategies/${id}`, { cache: 'no-store' }).then(r => r.json()).then(j => { setD(j); setEdit(j.strategy?.spec ?? null); });
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [id]);
  const act = async (action: string, extra: any = {}) => {
    if (action === 'stop' && !confirm('Stop this strategy and exit its open paper position?')) return;
    if (action === 'mode' && extra.mode === 'live' && !confirm('Flag for live? The dashboard never sends orders: the local runner on your machine picks up live strategies only after you switch it on there.')) return;
    const r = await post('/api/strategies', { action, id, ...extra }); if (r.error) return alert(r.error); onChange(); load();
  };
  const saveEdit = async () => { const r = await post('/api/strategies', { action: 'save', id, spec: edit }); if (r.error) return alert(r.error); onChange(); load(); };
  const del = async () => { if (!confirm('Delete this strategy?')) return; await post('/api/strategies', { action: 'delete', id }); onDeleted(); };
  const st = d?.strategy, dep = st?.deployment, P = d?.paper, H = d?.history;
  const trades = P?.trades ?? H?.trades ?? [];
  const markers = useMemo(() => !d?.bars ? [] : trades.flatMap((t: any) => [{ time: t.entryT, position: t.side === 1 ? 'belowBar' : 'aboveBar', color: t.side === 1 ? '#2fd59b' : '#ff6b6b', shape: t.side === 1 ? 'arrowUp' : 'arrowDown', text: t.side === 1 ? 'buy' : 'sell' },
    ...(t.reason === 'end' ? [] : [{ time: t.exitT, position: 'aboveBar', color: t.pnl > 0 ? '#2fd59b' : '#ff6b6b', shape: 'circle', text: t.reason }])]).filter((m: any) => m.time >= d.bars[0].t), [d]);
  const eqLine = useMemo(() => P?.equity?.length ? [{ name: 'Paper equity', color: '#2fd59b', data: P.equity }] : [], [P]);
  if (!d) return <div className="card" style={{ marginTop: 14 }}>Loading…</div>;
  const ks = edit ? knobs(edit) : [], errs = edit ? validate(edit) : [];
  return (<div className="card" style={{ marginTop: 14 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h3 style={{ margin: 0 }}>{st.spec.name} <span className="mono mute">{st.spec.symbol} {st.spec.tf}</span></h3>
      <div className="row">
        {!dep || dep.status === 'stopped' ? <button className="btn pri" onClick={() => act('deploy')}>{dep ? 'Redeploy (paper)' : 'Deploy to paper'}</button> : <>
          {dep.status === 'running' ? <button className="btn" onClick={() => act('pause')}>Pause</button> : <button className="btn" onClick={() => act('resume')}>Resume</button>}
          <button className="btn danger" onClick={() => act('stop')}>Stop + exit all</button>
          <label className="row">Mode <select value={dep.mode} onChange={e => act('mode', { mode: e.target.value })}><option value="paper">paper</option><option value="live">live (local runner)</option></select></label></>}
        <button className="btn" disabled={reviewing} onClick={async () => { setReviewing(true); try { await act('review'); } finally { setReviewing(false); } }}>{reviewing ? 'Reviewing…' : 'Second opinion'}</button>
        <button className="btn" onClick={() => setRules(!rules)}>{rules ? 'Hide rules' : 'Show rules'}</button>
        <button className="btn" onClick={del}>Delete</button>
      </div>
    </div>
    {d.error && <div className="banner bad">{d.error}</div>}
    {rules && <div style={{ marginTop: 10 }}><SpecView s={st.spec} /></div>}
    {st.review && <div className={`banner ${st.review.verdict === 'ok' ? '' : st.review.verdict === 'block' ? 'bad' : 'warn'}`} style={{ marginTop: 10 }}>
      <b>Review chain: owner, engineer, QA ({st.review.model}, {new Date(st.review.ts).toLocaleDateString()}): {st.review.verdict}</b>{st.review.specKey !== JSON.stringify(st.spec) ? ' · rules changed since, run it again' : ''}<div style={{ whiteSpace: 'pre-wrap' }}>{st.review.summary}</div>
      {st.review.issues.length > 0 && <ul style={{ margin: '6px 0 0' }}>{st.review.issues.map((x: any, i: number) => <li key={i}><b>{x.severity}</b>: {x.issue} <span className="mute">Fix: {x.fix}</span></li>)}</ul>}</div>}
    {!st.review && <div className="mute" style={{ marginTop: 8 }}>A second opinion from a different model is required before flagging this live.</div>}
    {dep?.mode === 'live' && <div className="banner warn">Flagged live. Orders only happen if the runner on your machine has live trading switched on with your own exchange keys; this page keeps showing the paper results.</div>}
    {P ? <div className="grid g4" style={{ marginTop: 12 }}>
      <div className="card"><div className="k">Net P&L (paper, since deploy)</div><div className={`v ${P.net >= 0 ? 'pos' : 'neg'}`}>{usd(P.net)}</div><div className="mute">on $10,000 · since {new Date(P.since).toLocaleString()}</div></div>
      <div className="card"><div className="k">Realized · unrealized</div><div className="v">{usd(P.realized)} · {usd(P.unrealized)}</div><div className="mute">fees paid {usd(P.fees)}</div></div>
      <div className="card"><div className="k">Fills · closed</div><div className="v">{P.fills} · {P.closed}</div><div className="mute">win rate {pct(P.winRate, 0)} ({P.wins}/{P.closed})</div></div>
      <div className="card"><div className="k">Open position</div>{P.open ? <><div className="v">{P.open.side === 1 ? 'LONG' : 'SHORT'} @ {P.open.entry.toFixed(2)}</div><div className="mute">stop {P.open.stop.toFixed(2)} · target {Number.isFinite(P.open.target) ? P.open.target.toFixed(2) : '–'} · mark {P.open.mark.toFixed(2)}</div></> : <div className="v mute">flat</div>}</div>
    </div> : <div className="banner" style={{ marginTop: 12 }}>Not deployed. Showing the backtest on recent history. Deploy to start a paper record that counts only trades from now on.</div>}
    {H && <div className="mute" style={{ marginTop: 8 }}>Backtest on {d.bars?.length ? 'recent' : ''} history ({d.source}): return {pct(H.metrics.totalReturn)} vs buy & hold {pct(H.metrics.buyHold)}, max DD {pct(H.metrics.maxDrawdown)}, {H.metrics.trades} trades, win {pct(H.metrics.winRate, 0)}{H.monteCarlo ? `, Monte Carlo 5-95%: ${pct(H.monteCarlo.ret5)} to ${pct(H.monteCarlo.ret95)}` : ''}.</div>}
    {d.bars?.length > 0 && <div style={{ marginTop: 12 }}><Chart candles={d.bars} markers={markers} height={340} /></div>}
    {eqLine.length > 0 && <div style={{ marginTop: 12 }}><h3>P&L curve</h3><Chart lines={eqLine} height={200} /></div>}
    {trades.length > 0 && <div className="tbl" style={{ marginTop: 12 }}><table><thead><tr><th>Entry</th><th>Side</th><th>Price</th><th>Exit</th><th>Reason</th><th>P&L</th><th>R</th></tr></thead><tbody>
      {[...trades].reverse().slice(0, 30).map((t: any, i: number) => <tr key={i}><td>{new Date(t.entryT).toLocaleString()}</td><td>{t.side === 1 ? 'long' : 'short'}</td><td>{t.entry.toFixed(2)}</td>
        <td>{t.reason === 'end' ? 'open' : t.exit.toFixed(2)}</td><td>{t.reason === 'end' ? '–' : t.reason}</td><td className={t.pnl >= 0 ? 'pos' : 'neg'}>{t.reason === 'end' ? '–' : usd(t.pnl)}</td><td>{t.reason === 'end' ? '–' : t.r.toFixed(2)}</td></tr>)}
    </tbody></table></div>}
    {edit && ks.length > 0 && <div style={{ marginTop: 14 }}><h3>Settings</h3><div className="row">
      {ks.map(k => <label key={k.path} className="row">{k.label} <input type="number" step="any" style={{ width: 90 }} value={k.value} onChange={e => setEdit(setPath(edit, k.path, +e.target.value))} /></label>)}
      <button className="btn pri" disabled={errs.length > 0 || JSON.stringify(edit) === JSON.stringify(st.spec)} onClick={saveEdit}>Save settings</button></div>
      {errs.length > 0 && <div className="warn">{errs.join('; ')}</div>}
      {dep && dep.status !== 'stopped' && <div className="mute">Saving applies to the whole paper record, since results are recomputed from the rules.</div>}</div>}
  </div>);
}
