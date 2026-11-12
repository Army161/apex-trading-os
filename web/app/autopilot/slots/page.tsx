import { EmptyState, FIXED } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { slots } from '@/lib/queries';
import { Card, NoLedger, SlotsTable } from '@/components/autopilot/parts';
export const metadata = { title: 'Slots' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const rows = slots(l.view);
  if (!rows.length) return <EmptyState title={FIXED.nothingPassed} reason="A slot is a pair that passed all seven checks, was confirmed by the validator and was then locked into paper trading."
    next="Nothing is in paper yet. The board shows how close each pair came." />;
  return <Card><SlotsTable rows={rows} caption="Every slot ever locked. A slot is judged only on bars after its lock." />
    <p className="ax-n">{FIXED.live}</p></Card>;
}
