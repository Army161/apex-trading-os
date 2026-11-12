import { FIXED, Funnel, statusOf } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { board, funnelOf } from '@/lib/queries';
import { BoardTable, Card, Filters, NoLedger, Pick } from '@/components/autopilot/parts';
export const metadata = { title: 'Autopilot' };
export const dynamic = 'force-dynamic';
const one = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) || undefined;
const SHOW = 100;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const sp = await searchParams, f = { status: one(sp.status), market: one(sp.market), tf: one(sp.tf), q: one(sp.q) };
  const fn = funnelOf(l.view), b = board(l.view, f), filtered = Boolean(f.status || f.market || f.tf || f.q);
  return <div className="grid">
    <Card>
      <Funnel caption="From tried to live" stages={[
        { label: 'Tried', count: fn.tried, note: fn.waiting ? `${fn.waiting} more registered and waiting to run` : undefined },
        { label: 'Passed all 7 checks', count: fn.passed, note: 'on past data' }, { label: 'Validator agreed', count: fn.validated },
        { label: 'In paper', count: fn.paper }, { label: 'Eligible', count: fn.eligible }, { label: 'Live', count: fn.live }]} />
      <p className="ax-n">Not passed: {fn.rejected} with no edge, {fn.nearMiss} near misses, {fn.needsData} needing more data.{fn.passed === 0 ? ` ${FIXED.nothingPassed}` : ''}</p>
    </Card>
    <Card title="Board">
      <Filters action="/autopilot">
        <Pick name="status" label="Status" value={f.status} options={b.statuses.map(s => ({ value: s, label: statusOf(s).label }))} />
        <Pick name="market" label="Market" value={f.market} options={b.markets.map(m => ({ value: m, label: m }))} />
        <Pick name="tf" label="Timeframe" value={f.tf} options={b.tfs.map(t => ({ value: t, label: t }))} />
        <label className="ax-pick"><span className="ax-label">Search</span><input name="q" defaultValue={f.q ?? ''} placeholder="Strategy or market" /></label>
      </Filters>
      {b.rows.length ? <BoardTable rows={b.rows.slice(0, SHOW)} caption={`Results on past data, after assumed costs. None of this is a forward record. Sorted by status, then checks passed, then Sharpe; never by return. ${b.rows.length > SHOW ? `First ${SHOW} of ${b.rows.length}` : b.rows.length} ${filtered ? `matching, of ${b.total} tried` : 'tried'}.`} />
        : <p className="ax-n">No pair matches these filters. {b.total} pairs have been tried.</p>}
    </Card>
  </div>;
}
