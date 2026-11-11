import Link from 'next/link';
import { MAX_CHARS, FLAG_NAME, NOTICE } from '@apex/claims';
import { StatusChip, VERDICT_STATUS, count } from '@apex/ui';
import { loadLedger, shellStatus } from '@/lib/ledger';
import { claimChecks } from '@/lib/queries';
import { Card, Hash, Ref } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import ClaimForm from '@/components/claims/ClaimForm';
export const metadata = { title: 'Claim check' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await loadLedger(), st = await shellStatus(), rows = l.ok ? claimChecks(l.entries) : [];
  return <div className="grid">
    <Card><p>Paste what someone says works. Apex pulls out the exact rules, tests them as stated with the same seven checks as everything else, and says plainly what it found.</p>
      <p className="ax-n">{NOTICE} The verdict is about the rules as extracted, not about the person who wrote them.</p></Card>
    <ClaimForm triesSoFar={st.trials} aiEnabled={st.aiEnabled} signedIn={st.signedIn} maxChars={MAX_CHARS} names={FLAG_NAME} notice={NOTICE} />
    <Card>{rows.length ? <div className="ax-scroll"><table className="ax-table"><caption>Past checks, newest first</caption>
      <thead><tr><th scope="col">Check</th><th scope="col">When</th><th scope="col">Verdict</th><th scope="col">Source</th><th scope="col" className="ax-num">Readings run</th><th scope="col" className="ax-num">Flags</th><th scope="col">Content</th><th scope="col">Receipt</th></tr></thead>
      <tbody>{rows.slice(0, 100).map(c => <tr key={c.seq}><th scope="row"><Link href={`/claims/${c.id}`}>{c.id}</Link></th><td><LocalTime t={c.ts} /></td>
        <td>{c.verdict && c.verdict in VERDICT_STATUS ? <StatusChip def={VERDICT_STATUS[c.verdict as keyof typeof VERDICT_STATUS]} /> : 'none'}</td><td>{c.sourceKind}, {count(c.chars)} characters</td>
        <td className="ax-num">{count(c.readings)}</td><td className="ax-num">{count(c.flags.length)}</td><td><Hash h={c.contentHash} /></td><td><Ref seq={c.seq} /></td></tr>)}</tbody></table></div>
      : <p className="ax-n">{l.ok ? 'No check has been recorded yet.' : 'No ledger is connected, so there is no history to show.'}</p>}</Card>
  </div>;
}
