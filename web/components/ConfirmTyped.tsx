'use client';
// A risky action is never one tap (docs/design/07 s1): the exact phrase has to be typed, a reason has to be given, and the
// button says what will happen. The server checks the phrase again; this form only saves a round trip.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
export default function ConfirmTyped({ action, body, phrase, button, what }: { action: string; body: Record<string, string>; phrase: string; button: string; what: string }) {
  const router = useRouter(), id = useId();
  const [typed, setTyped] = useState(''), [reason, setReason] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const ready = typed === phrase && reason.trim().length >= 3 && !busy;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (!ready) return; setBusy(true); setMsg('');
    try {
      const r = await fetch(action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, confirm: typed, reason }) }), j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg('Done. It is in the ledger.'); setTyped(''); setReason(''); router.refresh(); } else setMsg(j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached.'); } finally { setBusy(false); }
  };
  return (
    <form className="ax-confirm" onSubmit={go}>
      <p>{what}</p>
      <label htmlFor={`${id}-r`}>Why is it safe to resume? This is kept in the ledger.</label>
      <input id={`${id}-r`} value={reason} onChange={e => setReason(e.target.value)} autoComplete="off" maxLength={300} />
      <label htmlFor={`${id}-p`}>Type <code>{phrase}</code> to confirm.</label>
      <input id={`${id}-p`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      <div><button type="submit" className="ax-btn" disabled={!ready}>{busy ? 'Working' : button}</button></div>
      <p className="ax-n" role="status">{msg}</p>
    </form>
  );
}
