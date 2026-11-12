import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLedger, readReport } from '@/lib/ledger';
import { runs } from '@/lib/queries';
import { Card, NoLedger, Ref, param } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import Markdown from '@/components/Markdown';
export const metadata = { title: 'Report' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const id = param((await params).id), r = runs(l.entries).find(x => x.id === id); if (!r) notFound();
  const text = await readReport(id);
  return <div className="grid">
    <Card><p>Run <code>{r.id}</code> ({r.mode}), <LocalTime t={r.ts} />, entry <Ref seq={r.seq} />. <Link href="/autopilot/reports">All reports</Link></p>
      {r.problems.length > 0 && <ul className="ax-list">{r.problems.map((p, i) => <li key={i}><span className="ax-mark" data-tone="bad"><span aria-hidden="true">✕</span> Problem</span>: {p}</li>)}</ul>}</Card>
    <Card>{text ? <Markdown text={text} /> : <p className="ax-n">The text of this report was not kept where the dashboard can read it. The run itself is in the ledger, and the terminal prints the latest report: <code>npm run apex -- report</code>.</p>}</Card>
  </div>;
}
