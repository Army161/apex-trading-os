'use client';
// Assistants tab (archive/chat/27): morning brief, Friday Deal Seeker, Risk Mitigator chat.
import { useEffect, useState } from 'react';
import { useVoice, VoiceButtons } from './voice';

const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

export default function Assistants({ aiEnabled }: { aiEnabled?: boolean }) {
  const [briefs, setBriefs] = useState<any[]>([]); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = () => fetch('/api/briefs', { cache: 'no-store' }).then(r => r.json()).then(j => setBriefs(j.briefs ?? []));
  useEffect(() => { load(); }, []);
  const run = async (kind: 'brief' | 'deals') => {
    setBusy(kind); setErr('');
    try { const r = await fetch(`/api/cron/${kind}`, { cache: 'no-store' }); const j = r.status === 403 ? { error: 'Log in on the Setup tab first (needs APEX_ADMIN_PASSWORD).' } : await r.json(); if (j.error) setErr(j.error); load(); }
    finally { setBusy(''); }
  };
  const latest = (k: string) => briefs.find(b => b.kind === k);
  return (<>
    {!aiEnabled && <div className="banner warn">The assistants need ANTHROPIC_API_KEY in the Vercel environment (they use Claude with web search for news, earnings and the economic calendar).</div>}
    <div className="grid g2">
      {(['brief', 'deals'] as const).map(k => { const b = latest(k); return <div className="card" key={k}>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{k === 'brief' ? 'Morning brief' : 'Deal Seeker'}</h3>
          <button className="btn" disabled={!!busy} onClick={() => run(k)}>{busy === k ? 'Running… (1-3 min)' : 'Run now'}</button></div>
        <div className="mute" style={{ margin: '6px 0' }}>{k === 'brief' ? 'Every day at 5:45am Arizona (12:45 UTC): gappers, earnings before and after the bell, economic reports, market-moving news, what is moving BTC, biggest downside risk.' : 'Fridays 2pm Arizona: weekly oversold screen on quality large caps and crypto majors, 25 names cut to a top 5 with the level that proves each wrong.'} Sent to Telegram, and to Discord if DISCORD_WEBHOOK_URL is set.</div>
        {b ? <><div className="mono mute">{new Date(b.ts).toLocaleString()}{b.source ? ` · ${b.source}` : ''}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{b.text}</div>
          {b.sources?.length > 0 && <div className="mute" style={{ marginTop: 8, wordBreak: 'break-all' }}>Sources: {b.sources.slice(0, 6).map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{new URL(u).hostname}</a>)}</div>}</>
          : <div className="mute">Nothing yet.</div>}
      </div>; })}
    </div>
    {err && <div className="banner bad" style={{ marginTop: 10 }}>{err}</div>}
    <div className="grid g2" style={{ marginTop: 14 }}><Lenses past={briefs.filter(b => b.kind === 'lenses')} onDone={load} /><Crowd past={briefs.filter(b => b.kind === 'crowd')} onDone={load} /><Macro /></div>
    <RiskChat />
  </>);
}

function RiskChat() {
  const [msgs, setMsgs] = useState<{ role: string; content: string; tools?: string[] }[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<any[]>([]); const [minRR, setMinRR] = useState(3); const v = useVoice();
  const loadSaved = () => fetch('/api/risk', { cache: 'no-store' }).then(r => r.json()).then(j => { setSaved(j.summaries ?? []); setMinRR(j.minRR ?? 3); });
  useEffect(() => { loadSaved(); }, []);
  const send = async (text: string, summarize = false, redteam = false) => {
    if (!summarize && !text.trim()) return; const next = summarize ? msgs : [...msgs, { role: 'user', content: text }]; setMsgs(next); setQ(''); setBusy(true);
    try { const r = await post('/api/risk', { messages: next.map(({ role, content }) => ({ role, content })), summarize, redteam }); if (summarize) loadSaved(); else { setMsgs([...next, { role: 'assistant', content: r.reply ?? r.error, tools: r.tools }]); v.speak(r.reply ?? ''); } }
    catch (e: any) { setMsgs([...next, { role: 'assistant', content: `Error: ${e.message}` }]); } finally { setBusy(false); }
  };
  const ideas = ['I want to long BTC here at the current price with a stop 4% below. Target is the last high. Good idea?', 'Thinking of shorting SOL after this run-up. Talk me out of it or into it.', 'QQQ is near all-time highs. Buy now for a swing or wait for a pullback?'];
  return (<div className="card" style={{ marginTop: 14 }}>
    <h3>Risk Mitigator</h3>
    <div className="mute">Talk a trade through before you take it. It checks every idea against {minRR}:1 reward to risk (more for shorts), always lays out the downside, and saves a summary to your journal notes.</div>
    <div className="chat" style={{ marginTop: 10 }}>{msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'u' : ''}`}>{m.content}{m.tools?.length ? <div className="mute mono" style={{ marginTop: 6 }}>used: {m.tools.join(', ')}</div> : null}</div>)}
      {!msgs.length && <div className="row">{ideas.map(x => <button key={x} className="btn" onClick={() => send(x)} style={{ textAlign: 'left' }}>{x}</button>)}</div>}</div>
    <div className="row" style={{ marginTop: 8 }}>
      <input style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(q)} placeholder="Describe the trade: market, side, entry, stop, target…" />
      <button className="btn pri" disabled={busy} onClick={() => send(q)}>{busy ? '…' : 'Send'}</button>
      <button className="btn" disabled={busy || !(q.trim() || msgs.length)} title="Argue against it like an investor who wants to pass, then name the one thing that would change its mind" onClick={() => send(q.trim() || 'Red team the trade we are discussing.', false, true)}>Red team it</button>
      <button className="btn" disabled={busy || msgs.length < 2} onClick={() => send('', true)}>Summarise to journal</button>
      <button className="btn" onClick={() => setMsgs([])}>New chat</button>
      <VoiceButtons v={v} onText={t => send(t)} />
    </div>
    {saved.length > 0 && <div style={{ marginTop: 12 }}><h3>Saved summaries</h3>{saved.slice(0, 6).map((s, i) => <div key={i} className="card" style={{ background: 'var(--bg)', marginBottom: 8 }}><div className="mono mute">{new Date(s.ts).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap' }}>{s.summary}</div></div>)}</div>}
  </div>);
}

function Lenses({ past, onDone }: { past: any[]; onDone: () => void }) {
  return <ResearchCard title="Investor lenses" api="/api/lenses" field="symbol" initial="AAPL" button="Compare views" past={past} onDone={onDone}
    blurb="One ticker through four classic styles side by side: deep value (Graham-style), quality (Buffett-style), growth at a fair price (Lynch-style) and inversion (Munger-style), then where they agree and disagree. These are styles, not the real people. Uses web search, about $0.10-0.30 a run." />;
}

function Crowd({ past, onDone }: { past: any[]; onDone: () => void }) {
  return <ResearchCard title="Crowd check" api="/api/crowd" field="topic" initial="Bitcoin" button="Check the crowd" past={past} onDone={onDone}
    blurb="What real people said in the last 30 days on Reddit, X, YouTube and Hacker News, plus Polymarket odds on related events. Crowd opinion, not fact: a one-sided mood is flagged as a contrarian warning. About $0.10-0.30 a run." />;
}

function ResearchCard({ title, api, field, initial, button, blurb, past, onDone }: { title: string; api: string; field: string; initial: string; button: string; blurb: string; past: any[]; onDone: () => void }) {
  const [sym, setSym] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [cur, setCur] = useState<any>(null);
  const run = async () => {
    setBusy(true); setErr('');
    try { const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [field]: sym }) });
      const j = await r.json(); if (j.error) setErr(r.status === 401 ? 'Log in on the Setup tab first.' : j.error); else { setCur(j); onDone(); } }
    finally { setBusy(false); }
  };
  const show = cur ?? past[0];
  return <div className="card"><h3>{title}</h3>
    <div className="mute">{blurb}</div>
    <div className="row" style={{ marginTop: 8 }}><input value={sym} onChange={e => setSym(field === 'symbol' ? e.target.value.toUpperCase() : e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} style={{ width: 160 }} />
      <button className="btn pri" disabled={busy} onClick={run}>{busy ? 'Working… (1-2 min)' : button}</button></div>
    {err && <div className="banner bad" style={{ marginTop: 8 }}>{err}</div>}
    {show && <><div className="mono mute" style={{ marginTop: 8 }}>{show.symbol} · {new Date(show.ts).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{show.text}</div>
      {show.sources?.length > 0 && <div className="mute" style={{ marginTop: 8, wordBreak: 'break-all' }}>Sources: {show.sources.slice(0, 6).map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{new URL(u).hostname}</a>)}</div>}</>}
  </div>;
}

function Macro() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { fetch('/api/macro', { cache: 'no-store' }).then(r => r.json()).then(setM).catch(e => setM({ ok: false, note: e.message, series: [] })); }, []);
  return <div className="card"><h3>Macro</h3>
    <div className="mute">Rates, inflation, jobs, the dollar and the VIX from FRED (St. Louis Fed), refreshed hourly. The morning brief covers the news and the economic calendar.</div>
    {!m ? <div className="mute">Loading…</div> : !m.ok ? <div className="banner warn" style={{ marginTop: 8 }}>{m.note}</div> :
      <table className="wrap" style={{ marginTop: 8 }}><thead><tr><th>Series</th><th>Latest</th><th>Change</th><th>As of</th></tr></thead><tbody>
        {m.series.map((x: any) => <tr key={x.id}><td>{x.label}</td><td className="mono">{x.error ? '-' : x.value}</td><td className="mono">{x.change == null ? '' : `${x.change > 0 ? '+' : ''}${x.change}`}</td><td className="mono mute">{x.date ?? x.error}</td></tr>)}</tbody></table>}
  </div>;
}
