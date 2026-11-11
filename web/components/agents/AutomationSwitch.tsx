'use client';
// One job's switch. Off is one tap and needs no sign-in, like Halt. On is refused by the server unless you are signed in.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export default function AutomationSwitch({ id, on }: { id: string; on: boolean }) {
  const router = useRouter(), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true); setMsg('');
    try { const r = await fetch('/api/automations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, on: !on }) }), j = await r.json().catch(() => ({}));
      if (r.ok) router.refresh(); else setMsg(j.error || 'The server refused the request.');
    } catch { setMsg('The server could not be reached.'); } finally { setBusy(false); }
  };
  return <><button type="button" className="ax-btn" role="switch" aria-checked={on} aria-label={`${id} is ${on ? 'on' : 'off'}`} disabled={busy} onClick={flip}>{on ? 'On. Switch off' : 'Off. Switch on'}</button>{msg ? <p className="ax-n" role="status">{msg}</p> : null}</>;
}
