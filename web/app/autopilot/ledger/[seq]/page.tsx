import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Receipt } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { ledgerEntry } from '@/lib/queries';
import { Card, NoLedger, receiptHref } from '@/components/autopilot/parts';
export const metadata = { title: 'Ledger entry' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ seq: string }> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const raw = (await params).seq, e = /^\d{1,12}$/.test(raw) ? ledgerEntry(l.entries, Number(raw)) : null; if (!e) notFound();
  return <div className="grid">
    <Card><p>{e.summary || e.receipt.kind.replace(/_/g, ' ')}</p><Receipt entry={e.receipt} />
      <p className="ax-pager">{e.prev !== null ? <Link className="ax-btn" href={receiptHref(e.prev)}>Previous entry</Link> : null}{e.next !== null ? <Link className="ax-btn" href={receiptHref(e.next)}>Next entry</Link> : null}<Link className="ax-btn" href="/autopilot/ledger">All entries</Link></p></Card>
    <Card title="What was recorded"><pre className="ax-pre">{JSON.stringify(e.payload, null, 2)}</pre>
      <p className="ax-n">This is the entry as written. Its payload hash above is the hash of exactly this content.</p></Card>
  </div>;
}
