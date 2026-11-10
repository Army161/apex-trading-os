'use client';
// "Grill me" interview (archive/chat/33): 20 questions one at a time, Claude drafts a rules file, Jeremy edits and saves it.
// Apex AI, the Telegram chat and Risk Mitigator follow the saved file; the house rules still win.
import { useEffect, useState } from 'react';

const post = (b: unknown) => fetch('/api/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, ...(await r.json()) }));

export default function TraderRules() {
  const [qs, setQs] = useState<string[]>([]); const [saved, setSaved] = useState<any>(null);
  const [mode, setMode] = useState<'view' | 'ask' | 'edit'>('view'); const [i, setI] = useState(0); const [ans, setAns] = useState<string[]>([]);
  const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = () => fetch('/api/rules', { cache: 'no-store' }).then(r => r.json()).then(j => { setQs(j.questions ?? []); setSaved(j.rules); });
  useEffect(() => { load(); }, []);
  const err = (r: any) => setMsg(r.status === 401 ? 'Log in on the Setup tab first.' : r.error);
  const finish = async () => { setBusy(true); setMsg(''); try { const r = await post({ answers: ans }); if (r.error) err(r); else { setDraft(r.draft); setMode('edit'); } } finally { setBusy(false); } };
  const save = async () => { const r = await post({ text: draft }); if (r.error) return err(r); setMode('view'); setMsg('Saved. Apex AI, Telegram and Risk Mitigator follow these from now on.'); load(); };
  return <div className="card" style={{ marginBottom: 14 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Your trading rules</h3>
      <div className="row">
        {mode === 'view' && <button className="btn pri" onClick={() => { setMode('ask'); setI(0); setAns([]); setMsg(''); }}>{saved ? 'Redo the interview' : 'Start the interview (20 questions)'}</button>}
        {mode === 'view' && saved && <button className="btn" onClick={() => { setDraft(saved.text); setMode('edit'); }}>Edit</button>}
      </div></div>
    <div className="mute" style={{ marginTop: 6 }}>Apex asks how you make trading decisions, one question at a time, then writes your answers up as rules its AI tools follow. The house rules (paper first, 1% risk cap, a stop on every trade) still win.</div>
    {mode === 'view' && (saved ? <><div className="mono mute" style={{ marginTop: 10 }}>Saved {new Date(saved.ts).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{saved.text}</div></> : <div className="mute" style={{ marginTop: 10 }}>No rules saved yet.</div>)}
    {mode === 'ask' && qs.length > 0 && <div style={{ marginTop: 12 }}>
      <div className="mono mute">Question {i + 1} of {qs.length}</div>
      <div style={{ fontWeight: 600, margin: '6px 0' }}>{qs[i]}</div>
      <textarea key={i} rows={3} style={{ width: '100%' }} defaultValue={ans[i] ?? ''} onChange={e => { const a = [...ans]; a[i] = e.target.value; setAns(a); }} placeholder="Answer in your own words, or skip" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        {i < qs.length - 1 ? <button className="btn pri" onClick={() => setI(i + 1)}>{ans[i]?.trim() ? 'Next' : 'Skip'}</button>
          : <button className="btn pri" disabled={busy} onClick={finish}>{busy ? 'Writing your rules…' : 'Write my rules'}</button>}
        <button className="btn" onClick={() => setMode('view')}>Cancel</button>
        <span className="mute">{ans.filter(x => x?.trim()).length} answered</span>
      </div></div>}
    {mode === 'edit' && <div style={{ marginTop: 12 }}>
      <textarea rows={16} style={{ width: '100%' }} className="mono" value={draft} onChange={e => setDraft(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}><button className="btn pri" onClick={save}>Save rules</button><button className="btn" onClick={() => setMode('view')}>Cancel</button></div></div>}
    {msg && <div className="banner" style={{ marginTop: 10 }}>{msg}</div>}
  </div>;
}
