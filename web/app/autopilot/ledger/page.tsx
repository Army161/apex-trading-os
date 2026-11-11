import Link from 'next/link';
import { count } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { ledgerPage } from '@/lib/queries';
import { Card, Filters, Hash, NoLedger, Pick, Ref, slotHref } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Ledger' };
export const dynamic = 'force-dynamic';
const one = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const sp = await searchParams, kind = one(sp.kind), slot = one(sp.slot), b = Number(one(sp.before)), before = Number.isInteger(b) && b > 0 ? b : undefined;
  const p = ledgerPage(l.entries, { kind, slot, before, limit: 50 }), qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(slot ? { slot } : {}), ...(p.next ? { before: String(p.next) } : {}) }).toString();
  return <div className="grid">
    <Card>
      <p><span className="ax-mark" data-tone={p.chain.ok ? 'acc' : 'bad'}><span aria-hidden="true">{p.chain.ok ? '●' : '✕'}</span> {p.chain.ok ? 'The chain checks out' : `The chain is broken at entry ${p.chain.badSeq ?? '?'}`}</span>
        {p.chain.ok ? <>: all {count(l.entries.length)} entries link to the one before.{p.head ? <> Head #{count(p.head.seq)}, hash <Hash h={p.head.hash} />.</> : null}</> : <>: {p.chain.why ?? 'no detail'}. Nothing after that entry can be trusted until it is explained.</>}</p>
      <p className="ax-n">Entries are only ever added. Each carries the hash of the one before, so a changed or removed entry shows. Check it yourself: <code>npm run apex -- ledger verify</code>.</p>
    </Card>
    <Card>
      <Filters action="/autopilot/ledger">
        <Pick name="kind" label="Kind" value={kind} options={p.kinds.map(k => ({ value: k, label: k.replace(/_/g, ' ') }))} />
        <label className="ax-pick"><span className="ax-label">Slot</span><input name="slot" defaultValue={slot ?? ''} placeholder="Exact slot key" /></label>
      </Filters>
      {p.rows.length ? <div className="ax-scroll"><table className="ax-table"><caption>Entries, newest first. {count(p.total)} {kind || slot ? 'matching' : 'in all'}</caption>
        <thead><tr><th scope="col">Entry</th><th scope="col">When</th><th scope="col">Kind</th><th scope="col">By</th><th scope="col">What</th><th scope="col">Hash</th></tr></thead>
        <tbody>{p.rows.map(r => <tr key={r.seq}><th scope="row"><Ref seq={r.seq} /></th><td><LocalTime t={r.ts} /></td><td>{r.kind.replace(/_/g, ' ')}</td><td>{r.actor}</td>
          <td>{r.summary}{r.slotKey ? <> <Link className="ax-n" href={slotHref(r.slotKey)}>slot</Link></> : null}</td><td><Hash h={r.hash} /></td></tr>)}</tbody></table></div>
        : <p className="ax-n">No entry matches.</p>}
      {p.next ? <p><Link className="ax-btn" href={`/autopilot/ledger?${qs}`}>Older entries</Link></p> : null}
    </Card>
  </div>;
}
