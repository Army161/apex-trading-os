'use client';
// Dashboard pieces for chat/35-41: the state strip and andon cord (Command tab), the memory card (Journal tab), and the
// agent job board, gallery and decision log (Agents tab).
import { useEffect, useState } from 'react';

const get = (u: string) => fetch(u, { cache: 'no-store' }).then(async r => ({ status: r.status, ...(await r.json()) }));
const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const login = 'Log in on the Setup tab first.';

export function StateStrip() {
  const [s, setS] = useState<any>(null); const [why, setWhy] = useState(''); const [msg, setMsg] = useState('');
  const load = () => get('/api/state').then(setS);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!s) return null;
  const act = async (b: any) => { const r = await post('/api/andon', b); setMsg(r.status === 401 ? login : ''); load(); };
  return <div className="card" style={{ marginBottom: 14, borderColor: s.halted ? 'var(--bad)' : undefined }}>
    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <h3 style={{ margin: 0 }}>{s.halted ? `Halted: ${s.haltReason}` : s.killswitch ? 'Kill switch on' : 'Apex is running'}</h3>
      <span className="mute">Andon pulls this week: <b>{s.pulls7d}</b></span></div>
    <div className="grid g4" style={{ marginTop: 10 }}>
      <div><div className="k">Strategies deployed</div><div className="v">{s.strategies.deployed}</div><div className="mute">{s.strategies.paper} paper · {s.strategies.saved} saved</div></div>
      <div><div className="k">Waiting on you</div><div className="v">{s.pendingProposals + s.jobs.needsYou}</div><div className="mute">{s.pendingProposals} proposals · {s.jobs.needsYou} agent jobs</div></div>
      <div><div className="k">AI spend today</div><div className="v">${s.aiToday}</div><div className="mute">budget ${s.aiBudget}</div></div>
      <div><div className="k">Setup</div><div className="v">{s.setup.done} of {s.setup.total}</div><div className="mute">{s.setup.missing.join(', ') || 'all done'}</div></div>
    </div>
    <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
      {s.halted ? <button className="btn pri" onClick={() => act({ release: true })}>Release the andon cord</button>
        : <><input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why are you stopping everything?" style={{ flex: '1 1 220px' }} />
          <button className="btn" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }} onClick={() => act({ pull: true, reason: why || 'pulled from the dashboard' })}>Pull the andon cord</button></>}
      <span className="mute">Any bot, check or agent can pull it too. It pauses every bot and texts you.</span>
    </div>
    {msg && <div className="banner" style={{ marginTop: 8 }}>{msg}</div>}
  </div>;
}

export function MemoryCard() {
  const [m, setM] = useState<any>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [k, setK] = useState(''); const [t, setT] = useState('');
  const load = () => get('/api/memory').then(r => { if (r.status === 401) setMsg(login); else setM(r); });
  useEffect(() => { load(); }, []);
  const act = async (b: any) => { const r = await post('/api/memory', b); if (r.error) setMsg(r.status === 401 ? login : r.error); load(); };
  const dream = async () => { setBusy(true); setMsg(''); try { const r = await get('/api/cron/dream'); setMsg(r.error ?? (r.note || `Dream done: ${r.ops?.length ?? 0} changes.`)); load(); } finally { setBusy(false); } };
  return <div className="card" style={{ marginBottom: 14 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>What Apex remembers about you</h3>
      <button className="btn" disabled={busy} onClick={dream}>{busy ? 'Dreaming…' : 'Run dream now'}</button></div>
    <div className="mute" style={{ marginTop: 6 }}>Every night Apex reads the day's chats, journal and trades and updates these facts. A newer fact replaces an older one and keeps the date. Stored in your own database, nowhere else. Never secrets or keys.</div>
    {m?.suggestion && <div className="banner" style={{ marginTop: 10 }}><b>Suggested rules change</b> ({when(m.suggestion.ts)}): {m.suggestion.text}
      <div className="row" style={{ marginTop: 6 }}><span className="mute">Copy it into your rules above if you agree.</span><button className="btn" onClick={() => act({ action: 'dismiss_suggestion' })}>Dismiss</button></div></div>}
    <div className="tbl wrap" style={{ marginTop: 10 }}><table><thead><tr><th>Fact</th><th>Since</th><th>Replaced</th><th></th></tr></thead><tbody>
      {(m?.facts ?? []).map((f: any) => <tr key={f.id}><td><span className="mono mute">{f.key}</span><br />{f.text}</td><td className="mono">{when(f.ts)}<br /><span className="mute">{f.source}</span></td>
        <td className="mute">{f.history?.length ? f.history.slice(0, 2).map((h: any) => `${h.text} (${when(h.ts)})`).join('; ') : '-'}</td>
        <td><button className="btn" onClick={() => act({ action: 'retire', key: f.key })}>No longer true</button> <button className="btn" onClick={() => act({ action: 'forget', key: f.key })}>Forget</button></td></tr>)}
      {m && !m.facts?.length && <tr><td colSpan={4} className="mute">Nothing yet. Chat with Apex AI or run a dream after a day of use.</td></tr>}
    </tbody></table></div>
    <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}><input value={k} onChange={e => setK(e.target.value)} placeholder="topic, e.g. answer-style" style={{ flex: '0 1 180px' }} />
      <input value={t} onChange={e => setT(e.target.value)} placeholder="what Apex should remember" style={{ flex: '1 1 240px' }} />
      <button className="btn" disabled={!k || !t} onClick={() => { act({ action: 'remember', key: k, text: t }); setK(''); setT(''); }}>Remember</button></div>
    {msg && <div className="banner" style={{ marginTop: 8 }}>{msg}</div>}
  </div>;
}

const COLS: [string, string][] = [['queued', 'Queued'], ['working', 'Working'], ['needs_you', 'Needs you'], ['done', 'Done'], ['failed', 'Failed']];

export function Agents() {
  const [jobs, setJobs] = useState<any[]>([]); const [idea, setIdea] = useState(''); const [msg, setMsg] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState<any>(null); const [running, setRunning] = useState(false); const [ans, setAns] = useState('');
  const load = () => { get('/api/jobs').then(r => setJobs(r.jobs ?? [])); get('/api/decisions').then(r => setLog(r.status === 401 ? null : r)); };
  useEffect(() => { load(); }, []);
  const run = async (id: string) => {
    setRunning(true); setMsg('');
    try { for (let i = 0; i < 12; i++) { const r = await post('/api/jobs', { action: 'step', id }); if (r.error) { setMsg(r.status === 401 ? login : r.error); break; } load(); if (['done', 'failed', 'needs_you'].includes(r.job.stage)) break; } }
    finally { setRunning(false); load(); }
  };
  const start = async () => { const r = await post('/api/jobs', { action: 'start', idea }); if (r.error) return setMsg(r.status === 401 ? login : r.error); setIdea(''); setOpen(r.job.id); run(r.job.id); };
  const j = jobs.find(x => x.id === open);
  const gallery = jobs.flatMap(x => x.outputs.map((o: any) => ({ ...o, job: x }))).filter(o => o.kind !== 'spec').slice(0, 12);
  return <>
    <div className="card"><h3>Agent team: idea to reviewed paper strategy</h3>
      <div className="mute">A lead hands out the work: intake checks it is a trading idea and rates the risk, the writer builds the rules, a fixed gate checks they are valid with enough backtest trades, and a read-only checker (the review chain plus a fresh "goldfish" reviewer) sends serious fixes straight back to the writer, at most twice. The result is a saved paper draft; deploying stays your call.</div>
      <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}><input value={idea} onChange={e => setIdea(e.target.value)} placeholder="e.g. buy ETH 4h pullbacks to the 50 EMA in an uptrend, 2R target" style={{ flex: '1 1 300px' }} />
        <button className="btn pri" disabled={!idea.trim() || running} onClick={start}>{running ? 'Team working…' : 'Start'}</button></div>
      {msg && <div className="banner" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
    <div className="kanban" style={{ marginTop: 14 }}>{COLS.map(([k, label]) => <div className="card" key={k}><div className="k">{label} · {jobs.filter(x => x.stage === k).length}</div>
      {jobs.filter(x => x.stage === k).map(x => <div key={x.id} className="jobcard" onClick={() => setOpen(x.id)}><b>{x.title.replace(/^Strategy: /, '')}</b>
        <div className="mute">{x.step} · {x.agent} · risk {x.risk} · {Math.round(x.ms / 1000)}s</div></div>)}</div>)}</div>
    {j && <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>{j.title}</h3>
        {['queued', 'working'].includes(j.stage) && <button className="btn" disabled={running} onClick={() => run(j.id)}>Continue</button>}</div>
      {j.stage === 'needs_you' && <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}><input value={ans} onChange={e => setAns(e.target.value)} placeholder="Your answer for the team" style={{ flex: '1 1 260px' }} />
        <button className="btn pri" disabled={!ans} onClick={async () => { await post('/api/jobs', { action: 'answer', id: j.id, text: ans, step: 'write' }); setAns(''); run(j.id); }}>Send and continue</button></div>}
      <div style={{ marginTop: 10 }}>{j.notes.map((n: any, i: number) => <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span className="mono mute">{when(n.ts)}</span> <span className="badge">{n.by}</span> <span style={{ whiteSpace: 'pre-wrap' }}>{n.text}</span></div>)}</div>
    </div>}
    <div className="card" style={{ marginTop: 14 }}><h3>Gallery: what the agents made</h3>
      <div className="grid g3">{gallery.map((o, i) => <div key={i} className="jobcard"><div className="k">{o.label}</div><b>{o.job.title.replace(/^Strategy: /, '')}</b>
        <div className="mute" style={{ whiteSpace: 'pre-wrap' }}>{o.kind === 'backtest' ? (o.data?.error ?? `${o.data?.trades} trades, return ${(100 * (o.data?.totalReturn ?? 0)).toFixed(1)}%, max DD ${(100 * (o.data?.maxDrawdown ?? 0)).toFixed(1)}%`)
          : o.kind === 'review' ? `${o.data?.verdict}: ${o.data?.serious?.length ?? 0} serious, ${o.data?.optional?.length ?? 0} optional` : o.kind === 'strategy' ? `Saved draft ${o.ref} (Strategies tab)` : ''}</div></div>)}
        {!gallery.length && <div className="mute">Nothing yet.</div>}</div></div>
    <div className="card" style={{ marginTop: 14 }}><h3>Decision log</h3><div className="mute">Why each agent did what it did, so you or another agent can check the reasoning.</div>
      {!log ? <div className="mute" style={{ marginTop: 8 }}>{login}</div> : <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}>
        {log.decisions.map((d: any, i: number) => <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span className="mono mute">{when(d.ts)}</span> <span className="badge">{d.agent}</span> <b>{d.decision}</b><div className="mute" style={{ whiteSpace: 'pre-wrap' }}>{d.why}</div></div>)}
        {!log.decisions.length && <div className="mute">No decisions logged yet.</div>}</div>}
      {log && <><h3 style={{ marginTop: 14 }}>Every AI call (model gateway)</h3><div className="tbl"><table><thead><tr><th>Time</th><th>Feature</th><th>Model</th><th>Cost</th><th>Seconds</th><th>Result</th></tr></thead><tbody>
        {log.calls.slice(0, 40).map((c: any, i: number) => <tr key={i}><td className="mono">{when(c.ts)}</td><td>{c.feature}</td><td className="mono">{c.model}</td><td>${c.usd.toFixed(4)}</td><td>{(c.ms / 1000).toFixed(1)}</td><td className={c.error ? 'neg' : ''}>{c.error ?? c.stop}</td></tr>)}
      </tbody></table></div></>}
    </div>
  </>;
}
