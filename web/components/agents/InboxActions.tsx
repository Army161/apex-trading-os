'use client';
// The answer buttons of one Inbox card. Each option is one the job itself offered; the server checks it again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export default function InboxActions({ id, options }: { id: string; options: string[] }) {
  const router = useRouter(), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('');
    try { const r = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...body }) }), j = await r.json().catch(() => ({}));
      if (r.ok) router.refresh(); else setMsg(r.status === 401 ? 'Sign in first, under You, Setup.' : j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached.'); } finally { setBusy(false); }
  };
  return <div className="ax-actions">
    {options.map(o => <button key={o} type="button" className="ax-btn" disabled={busy} onClick={() => send({ action: 'settle', option: o })}>{o}</button>)}
    <button type="button" className="ax-btn" disabled={busy} onClick={() => send({ action: 'snooze', hours: 24 })}>Snooze for a day</button>
    <p className="ax-n" role="status">{msg}</p>
  </div>;
}
