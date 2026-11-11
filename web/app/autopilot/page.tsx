import { EmptyState, FIXED, Funnel } from '@apex/ui';
import { readLedger, paperCapital } from '@/lib/ledger';
import { funnel } from '@/lib/queries';
export const metadata = { title: 'Autopilot' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await readLedger();
  if (l.kind === 'none') return <EmptyState title="Storage is not set up, so nothing is recorded and nothing runs" reason="The autopilot keeps every try, slot and paper trade in a ledger. This dashboard has no ledger connected."
    next={<>Set <code>DATABASE_URL</code> in the Vercel environment (see You, Setup). On your own machine, <code>npm run apex -- status</code> reads the local ledger.</>} />;
  if (l.kind === 'error') return <EmptyState title="The ledger could not be read" reason={l.note ?? 'No detail was given.'} next="Nothing is shown rather than something that might be wrong. Check the database connection, then reload." />;
  if (!l.entries.length) return <EmptyState title="The first run has not happened yet" reason="The ledger is connected and empty." next={<>The nightly run fills it. To run now on your machine: <code>npm run apex -- run --full</code>.</>} />;
  const f = funnel(l.entries, paperCapital());
  return <div className="grid">
    <div className="card">
      <Funnel caption="From tried to live" stages={[
        { label: 'Tried', count: f.tried, note: f.waiting ? `${f.waiting} registered and waiting to run` : undefined },
        { label: 'Passed all 7 checks', count: f.passed, note: 'on past data' },
        { label: 'In paper', count: f.paper }, { label: 'Eligible', count: f.eligible }, { label: 'Live', count: f.live }]} />
      <p className="ax-n">Not passed: {f.rejected} with no edge, {f.nearMiss} near misses, {f.needsData} needing more data.{f.passed === 0 ? ` ${FIXED.nothingPassed}` : ''}</p>
    </div>
    <EmptyState title="The board, slots, paper book, risk, data health, reports and ledger screens are not built yet" reason="This page shows the funnel only."
      next={<>Until they are, the terminal shows the same ledger: <code>npm run apex -- board</code>, <code>slots</code>, <code>book</code>, <code>risk</code>, <code>ledger</code>.</>} />
  </div>;
}
