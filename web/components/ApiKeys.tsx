'use client';
// API keys on You, Setup. A key lets a program (the terminal's remote mode, the MCP server, the browser extension) read Apex
// and, if you tick it, start a claim check or pull the halt. No key can approve, resume, change a limit or go live: those
// scopes do not exist. The key is shown once here and is never stored in readable form.
import { useEffect, useState } from 'react';
import { READ_SCOPES, SCOPES, type Scope } from '@apex/sdk/contract';
import LocalTime from './LocalTime';

type Info = { id: string; name: string; scopes: Scope[]; created: number; lastUsed: number | null; revoked: number | null };
const ABOUT: Record<Scope, string> = { 'read:status': 'Status', 'read:board': 'Board and queue', 'read:slots': 'Slots and locks', 'read:book': 'Paper book and risk', 'read:ledger': 'Ledger', 'read:reports': 'Reports', 'read:data': 'Data health and costs',
  'read:agents': 'Agents (no routes yet)', 'queue:claims': 'Start claim checks (uses tries)', 'queue:research': 'Propose research (no routes yet)', halt: 'Pull the halt' };

export default function ApiKeys() {
  const [keys, setKeys] = useState<Info[] | null>(null), [usable, setUsable] = useState(true), [msg, setMsg] = useState(''), [name, setName] = useState(''), [scopes, setScopes] = useState<Scope[]>(READ_SCOPES), [fresh, setFresh] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const load = () => fetch('/api/admin/keys', { cache: 'no-store' }).then(async r => { const j = await r.json(); if (r.ok) { setKeys(j.keys); setUsable(j.usable); setMsg(''); } else { setKeys([]); setMsg(j.error ?? 'The keys could not be read.'); } }).catch(() => { setKeys([]); setMsg('The keys could not be read.'); });
  useEffect(() => { load(); }, []);
  const make = async () => { setBusy(true); setFresh(null);
    try { const r = await fetch('/api/admin/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, scopes }) }), j = await r.json();
      if (r.ok) { setFresh(j.key); setName(''); await load(); } else setMsg(j.error ?? 'The key was not made.'); } catch { setMsg('The key was not made.'); } finally { setBusy(false); } };
  const revoke = async (k: Info) => { if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working at once.`)) return;
    const r = await fetch(`/api/admin/keys/${k.id}`, { method: 'DELETE' }); if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? 'The key was not revoked.'); await load(); };
  const toggle = (s: Scope) => setScopes(x => (x.includes(s) ? x.filter(y => y !== s) : SCOPES.filter(y => y === s || x.includes(y))));
  return <div className="card"><h3>API keys</h3>
    <p className="mute">For programs that read Apex: the terminal in remote mode, the MCP server and the browser extension. A key can read, and if you allow it, start a claim check or pull the halt. No key can approve, resume, change a limit or go live.</p>
    <p className="mute">To connect a Claude app, add a custom connector with the address <span className="mono">/api/mcp</span> on this site and a key as the bearer token.</p>
    {!usable && <p role="status">Keys are switched off here: set <span className="mono">APEX_API_KEYS_PEPPER</span> (16 characters or more) in the environment first.</p>}
    {msg && <p role="alert">{msg}</p>}
    {fresh && <div role="status"><p><strong>Copy this key now.</strong> It is shown once and cannot be shown again.</p><pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fresh}</pre><button className="btn" onClick={() => setFresh(null)}>I have copied it</button></div>}
    {keys === null ? <p className="mute">Reading the keys.</p> : keys.length === 0 ? <p className="mute">No keys yet.</p> :
      <div style={{ overflowX: 'auto' }}><table className="wrap"><thead><tr><th scope="col">Name</th><th scope="col">Can</th><th scope="col">Last used</th><th scope="col"><span className="mute">State</span></th></tr></thead>
        <tbody>{keys.map(k => <tr key={k.id}><th scope="row" style={{ textAlign: 'left' }}>{k.name} <span className="mono mute">{k.id}</span></th><td>{k.scopes.join(', ')}</td>
          <td>{k.lastUsed ? <LocalTime t={k.lastUsed} /> : 'never'}</td>
          <td>{k.revoked ? <span className="badge off">revoked</span> : <button className="btn" onClick={() => revoke(k)}>Revoke</button>}</td></tr>)}</tbody></table></div>}
    <fieldset disabled={!usable || busy} style={{ marginTop: 12 }}><legend>New key</legend>
      <label>What will use it <input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="for example: MCP server on my laptop" /></label>
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>{SCOPES.map(s => <label key={s} style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} /> {ABOUT[s]}</label>)}</div>
      <button className="btn pri" style={{ marginTop: 8 }} disabled={name.trim().length < 2 || scopes.length === 0} onClick={make}>Make key</button></fieldset>
  </div>;
}
