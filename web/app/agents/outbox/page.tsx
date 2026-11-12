import Link from 'next/link';
import { outbox } from '@/lib/agentjobs';
import { Card } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Outbox' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const files = await outbox(100);
  return <div className="grid">
    {files.length ? files.map(f => <Card key={f.id} title={f.title}>
      <p className="ax-n">A {f.kind} by {f.agent}, <LocalTime t={f.ts} />. Written by an agent: read it as a note, not as a result.</p>
      <pre className="ax-pre">{f.text}</pre></Card>)
      : <Card><p>No agent has written anything yet.</p><p className="ax-n">Notes, proposals and reviews that agents write land here once those agents are built. The nightly reports are under <Link href="/autopilot/reports">Reports</Link>.</p></Card>}
  </div>;
}
