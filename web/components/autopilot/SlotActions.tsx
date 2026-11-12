'use client';
// Jeremy's two hand moves on a slot, and the lock 2 review (docs/design/02 s6, 04 s12). The server works out again whether
// each is allowed and checks every field; nothing here is trusted. None of these can approve, open lock 4 or place an order.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

/** Run the owner, engineer and QA review for a live-eligible slot. One ledger entry; it can open lock 2, never lock 3 or 4. */
export function PromotionReview({ slotKey }: { slotKey: string }) {
  const router = useRouter(), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/live/${encodeURIComponent(slotKey)}/review`, { method: 'POST' }), j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg(`Review recorded: ${j.verdict}. Lock 2 opens only when the verdict is not a block.`); router.refresh(); } else setMsg(j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached. Nothing was recorded.'); } finally { setBusy(false); }
  };
  return <p><button type="button" className="ax-btn" onClick={go} disabled={busy}>{busy ? 'Reviewing, this takes a minute' : 'Run the promotion review'}</button> <span className="ax-n" role="status">{msg}</span></p>;
}

/** Back to paper (only from a pause) or retire (final). The password again, the slot's name typed out, and a reason. */
export function SlotChange({ slotKey, paused }: { slotKey: string; paused: boolean }) {
  const router = useRouter(), id = useId();
  const [to, setTo] = useState<'' | 'paper' | 'retired'>(''), [typed, setTyped] = useState(''), [password, setPassword] = useState(''), [reason, setReason] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const ready = !!to && typed === slotKey && password.length > 0 && reason.trim().length >= 3 && !busy;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (!ready) return; setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/slots/${encodeURIComponent(slotKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, typed, password, reason }) }), j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg(`Recorded: ${j.from} to ${j.to}.`); setPassword(''); setTyped(''); setTo(''); router.refresh(); } else setMsg(j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached. Nothing was recorded.'); } finally { setBusy(false); }
  };
  if (!to) return <p>{paused ? <button type="button" className="ax-btn" onClick={() => setTo('paper')}>Back to paper</button> : null} <button type="button" className="ax-btn" onClick={() => setTo('retired')}>Retire</button></p>;
  return (
    <form className="ax-confirm" onSubmit={go}>
      <p><strong>{to === 'paper' ? 'Bring this slot back to paper.' : 'Retire this slot. This is final.'}</strong> {to === 'paper' ? 'It goes back to paper only, never straight to live, so its forward record and graduation are earned again. The server checks that the strategy still matches its lock, the data loads and the validator agreed after the pause.' : 'A retired idea comes back only as a new pre-registration.'}</p>
      <label htmlFor={`${id}-r`}>Why. This is kept in the ledger.</label>
      <input id={`${id}-r`} value={reason} onChange={e => setReason(e.target.value)} autoComplete="off" maxLength={500} />
      <label htmlFor={`${id}-n`}>Type the slot's name, <code>{slotKey}</code>, to confirm.</label>
      <input id={`${id}-n`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      <label htmlFor={`${id}-p`}>Your password, again.</label>
      <input id={`${id}-p`} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      <div><button type="submit" className="ax-btn" disabled={!ready}>{busy ? 'Working' : to === 'paper' ? 'Back to paper' : 'Retire it'}</button> <button type="button" className="ax-btn" onClick={() => setTo('')}>Cancel</button></div>
      <p className="ax-n" role="status">{msg}</p>
    </form>
  );
}
