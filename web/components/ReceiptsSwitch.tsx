'use client';
// Setup's switch for the public receipts page. Publishing is your call: both directions need you to be signed in.
import { useEffect, useState } from 'react';
export default function ReceiptsSwitch() {
  const [on, setOn] = useState<boolean | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/admin/settings/receipts').then(r => r.json()).then(j => setOn(j.on === true)).catch(() => setMsg('The switch could not be read.')); }, []);
  const flip = async () => { setBusy(true); setMsg('');
    try { const r = await fetch('/api/admin/settings/receipts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: !on }) }), j = await r.json().catch(() => ({})); if (r.ok) setOn(j.on === true); else setMsg(j.error || 'The server refused the request.'); }
    catch { setMsg('The server could not be reached.'); } finally { setBusy(false); } };
  return <div className="card" id="receipts"><h3>Public receipts page</h3>
    <p>A page at <code>/receipts</code> that shows each slot's paper record since its lock, with the ledger entries behind it and how to check them. It shows results in units of risk only: no money amounts, sizes, limits or keys. It is off until you switch it on, and anyone with the address can read it while it is on.</p>
    <p><strong>Before you share it:</strong> the page lives at this dashboard's own address, and the dashboard's other screens, the paper book among them, can be read there without signing in. Sharing the link shows people where the dashboard is.</p>
    <p><button type="button" className="ax-btn" role="switch" aria-checked={on === true} disabled={busy || on === null} onClick={flip}>{on === null ? 'Reading' : on ? 'On. Switch off' : 'Off. Switch on'}</button> {on ? <a href="/receipts">Open the page</a> : null}</p>
    <p className="ax-n" role="status">{msg}</p></div>;
}
