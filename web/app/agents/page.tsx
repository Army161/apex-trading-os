import Link from 'next/link';
import { count } from '@apex/ui';
import { audit, purposeStale } from '@/lib/policy';
import { SEED, ensureRoster } from '@/lib/roster';
import { getJSON } from '@/lib/store';
import { Card } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Roster' };
export const dynamic = 'force-dynamic';

const VERB: Record<string, string> = { read: 'read', analyze: 'analyze', write_file: 'write to the outbox', notify: 'notify you', browse: 'fetch from listed hosts', halt: 'halt' };
const RUNS = { dashboard: 'Runs on this dashboard', github: 'Runs in GitHub Actions', 'not built': 'Not built yet' } as const;

export default async function Page() {
  const roster = await ensureRoster(), used = await getJSON<Record<string, number>>(`agents:used:${new Date().toISOString().slice(0, 10)}`, {}), rows = await audit(2000);
  return <div className="grid">
    <Card><p>Agents research, check and report. They never trade: no agent has an order, pay, sign, send or delete verb, and none can release a halt. Every action is checked against the card below and logged before it happens. See <Link href="/agents/activity">Activity</Link>.</p></Card>
    <div className="grid g2">{SEED.map(a => { const stored = roster.find(r => r.id === a.id), last = rows.find(r => r.agent === a.id), n = used[a.id] ?? 0;
      return <Card key={a.id} title={a.id}>
        <p>{a.purpose}</p>
        <dl className="ax-facts">
          <dt>May</dt><dd>{a.tools.map(t => VERB[t] ?? t).join(', ')}</dd>
          <dt>Model</dt><dd>{a.model === 'none' ? 'None. Its decision is a fixed rule.' : <code>{a.model}</code>}</dd>
          <dt>Jobs today</dt><dd>{a.jobsPerDay ? `${count(n)} of ${count(a.jobsPerDay)}` : 'No budget here'}</dd>
          <dt>Starts on</dt><dd>{a.trigger}</dd>
          <dt>Last action</dt><dd>{last ? <><LocalTime t={last.ts} /> ({last.allow ? last.verb : `refused: ${last.rule}`})</> : 'None recorded'}</dd>
          <dt>Status</dt><dd>{RUNS[a.runs]}{a.note ? `. ${a.note}` : ''}</dd>
        </dl>
        {stored && purposeStale(stored) ? <p className="ax-n">Its verbs changed after its purpose was written. Read the purpose again.</p> : null}
      </Card>; })}</div>
    {roster.length > SEED.length ? <Card title="Other agents"><ul className="ax-list">{roster.filter(r => !SEED.some(a => a.id === r.id)).map(r => <li key={r.id}><strong>{r.id}</strong>: {r.purpose} <span className="ax-n">May {r.tools.join(', ')}. {count(r.jobsPerDay)} jobs a day.</span></li>)}</ul></Card> : null}
    <Card><p className="ax-n">Two helpers, playbook-distiller and build-buddy, are prompts in the plugin and run only when you start them in Claude Code. They are not on this roster.</p></Card>
  </div>;
}
