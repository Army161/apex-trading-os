import Link from 'next/link';
import { listJobs } from '@/lib/jobs';
import { shellStatus } from '@/lib/ledger';
import { Card } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import InboxActions from '@/components/agents/InboxActions';
export const metadata = { title: 'Inbox' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const now = Date.now(), waiting = (await listJobs()).filter(j => j.stage === 'needs_you'), open = waiting.filter(j => !(j.snoozedUntil && j.snoozedUntil > now)), later = waiting.filter(j => j.snoozedUntil && j.snoozedUntil > now), st = await shellStatus();
  return <div className="grid">
    {!st.signedIn && waiting.length > 0 ? <Card><p className="ax-n">You are not signed in, so an answer will be refused. Log in under <Link href="/you/setup">You, Setup</Link>.</p></Card> : null}
    {open.length ? open.map(j => <Card key={j.id} title={j.title}>
      <p>{j.ask?.question ?? j.notes[j.notes.length - 1]?.text ?? 'This job is waiting for you.'}</p>
      <p className="ax-n">From {j.agent}, waiting since <LocalTime t={j.updated} />.</p>
      {j.ask ? <InboxActions id={j.id} options={j.ask.options} /> : <p className="ax-n">This one takes a written answer. Give it on <Link href="/agents/team">Strategy team</Link>.</p>}
    </Card>) : <Card><p>Nothing is waiting for you.</p><p className="ax-n">A job lands here when an agent is unsure, or has used up a budget. It asks one question and waits.</p></Card>}
    {later.length ? <Card title="Snoozed"><ul className="ax-list">{later.map(j => <li key={j.id}>{j.title} <span className="ax-n">Back <LocalTime t={j.snoozedUntil!} />.</span></li>)}</ul></Card> : null}
  </div>;
}
