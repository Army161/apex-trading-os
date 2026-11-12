import { audit } from '@/lib/policy';
import { Card } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

const DID: Record<string, string> = { read: 'read', analyze: 'started a job on', write_file: 'wrote to', notify: 'sent a notification', browse: 'fetched from', halt: 'halted', send: 'asked to send', sign: 'asked to sign', delete: 'asked to delete', shell: 'asked to run a command', order: 'asked to place an order', pay: 'asked to pay', withdraw: 'asked to withdraw', transfer: 'asked to transfer' };
const WHO = { person: 'you started it', routine: 'on a schedule', agent: 'another agent asked' } as const;

export default async function Page() {
  const rows = await audit(200);
  return <div className="grid">
    <Card>{rows.length ? <div className="ax-scroll"><table className="ax-table"><caption>The last {rows.length} agent actions, newest first. Each row was written before the action ran</caption>
      <thead><tr><th scope="col">When</th><th scope="col">Agent</th><th scope="col">What</th><th scope="col">Result</th><th scope="col">Rule</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={`${r.ts}-${i}`}><td><LocalTime t={r.ts} /></td><th scope="row">{r.agent}</th><td>{DID[r.verb] ?? r.verb}{r.target ? ` ${r.target}` : ''} <span className="ax-n">({WHO[r.trigger] ?? r.trigger})</span></td>
        <td>{!r.allow ? 'Refused' : r.needsApproval ? 'Waits for you' : 'Allowed'}</td><td><code>{r.rule}</code> <span className="ax-n">{r.why}</span></td></tr>)}</tbody></table></div>
      : <p className="ax-n">No agent has acted since this dashboard's store was last empty.</p>}
      <p className="ax-n">Anything that looks like a key or a password is replaced by its length before a row is kept.</p></Card>
  </div>;
}
