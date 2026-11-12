'use client';
// The approval form for lock 3 (docs/design/07 s4.3). The slot screen shows it only when locks 1 and 2 are open and lock 3 is
// closed. Nothing here is trusted by the server: it works the locks out again and checks every field.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
export default function LiveApproval({ slotKey, stage, sizePct, maxDays, checklist }: { slotKey: string; stage: string; sizePct: number; maxDays: number; checklist: [string, string][] }) {
  const router = useRouter(), id = useId();
  const [open, setOpen] = useState(false), [ticked, setTicked] = useState<string[]>([]), [typed, setTyped] = useState(''), [password, setPassword] = useState(''), [cap, setCap] = useState(String(sizePct)), [days, setDays] = useState(String(maxDays)), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const ready = ticked.length === checklist.length && typed === slotKey && password.length > 0 && !busy;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (!ready) return; setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/live/${encodeURIComponent(slotKey)}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ typed, password, stage, sizeCap: Number(cap) / 100, expiryDays: Number(days), checklist: ticked }) }), j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg('Recorded in the ledger. Nothing trades until lock 4 is opened on your machine.'); setPassword(''); setTyped(''); router.refresh(); } else setMsg(j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached. Nothing was recorded.'); } finally { setBusy(false); }
  };
  if (!open) return <p><button type="button" className="ax-btn" onClick={() => setOpen(true)}>Review for micro-live</button></p>;
  return (
    <form className="ax-confirm" onSubmit={go}>
      <p><strong>Approve {stage.replace('_', '-')} for this slot.</strong> This records your approval in the ledger and does nothing else. Nothing trades until lock 4 is opened on your own machine, with your own keys. There is no button for that, here or anywhere.</p>
      <p className="ax-n">The executor that opens lock 4 runs only on your machine, rehearses by default, and has no live broker adapter yet, so today this approval cannot lead to a live order.</p>
      {checklist.map(([k, text]) => <label key={k} className="ax-tick"><input type="checkbox" checked={ticked.includes(k)} onChange={e => setTicked(t => e.target.checked ? [...t, k] : t.filter(x => x !== k))} /> {text}</label>)}
      <label htmlFor={`${id}-c`}>Size cap, as a percent of the paper-sized risk (at most {sizePct}).</label>
      <input id={`${id}-c`} inputMode="decimal" value={cap} onChange={e => setCap(e.target.value)} autoComplete="off" />
      <label htmlFor={`${id}-d`}>Days until this approval expires (at most {maxDays}).</label>
      <input id={`${id}-d`} inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} autoComplete="off" />
      <label htmlFor={`${id}-n`}>Type the slot's name, <code>{slotKey}</code>, to confirm.</label>
      <input id={`${id}-n`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      <label htmlFor={`${id}-p`}>Your password, again.</label>
      <input id={`${id}-p`} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      <div><button type="submit" className="ax-btn" disabled={!ready}>{busy ? 'Working' : 'Record my approval'}</button></div>
      <p className="ax-n" role="status">{msg}</p>
    </form>
  );
}
