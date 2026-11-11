import { AUTOMATIONS, nextRun, states, switchable } from '@/lib/automations';
import { MAX_FAILS } from '@/lib/policy';
import { shellStatus } from '@/lib/ledger';
import { Card } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import AutomationSwitch from '@/components/agents/AutomationSwitch';
export const metadata = { title: 'Automations' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const now = Date.now(), st = await states(), shell = await shellStatus(), built = AUTOMATIONS.filter(a => a.built), planned = AUTOMATIONS.filter(a => !a.built);
  return <div className="grid">
    <Card><div className="ax-scroll"><table className="ax-table"><caption>Scheduled jobs that exist today. Times are UTC in the schedule and your own time elsewhere</caption>
      <thead><tr><th scope="col">Job</th><th scope="col">Schedule</th><th scope="col">Last run</th><th scope="col">Next run</th><th scope="col">Status</th><th scope="col">Switch</th></tr></thead>
      <tbody>{built.map(a => { const s = st[a.id], sw = switchable(a), on = s?.on ?? true, next = a.cron && on ? nextRun(a.cron, now) : null, nightly = a.id === 'autopilot-full' ? shell.lastRun : null;
        return <tr key={a.id}><th scope="row">{a.id}<span className="ax-n ax-sub">{a.does}{a.note ? ` ${a.note}` : ''}</span></th><td>{a.schedule}</td>
          <td>{sw ? (s?.lastRun ? <LocalTime t={s.lastRun} /> : 'Not since the store was last empty') : nightly ? <><LocalTime t={nightly.ts} /> <span className="ax-n">from the ledger</span></> : 'No run is in the ledger'}</td>
          <td>{next ? <LocalTime t={next} /> : 'None while it is off'}</td>
          <td>{!sw ? 'Runs in GitHub Actions' : !on ? (s && s.fails >= MAX_FAILS ? `Switched itself off after ${MAX_FAILS} failures in a row` : 'Switched off') : !s?.lastRun ? 'On, no run recorded' : s.lastOk ? 'On, last run finished' : `On, last run failed${s.fails > 1 ? ` (${s.fails} in a row)` : ''}${s.lastNote ? `: ${s.lastNote}` : ''}`}</td>
          <td>{sw ? <AutomationSwitch id={a.id} on={on} /> : <span className="ax-n">Switched in the repository's Actions tab</span>}</td></tr>; })}</tbody></table></div>
      <p className="ax-n">A job on this dashboard runs only when the host calls it on schedule, so the next run is when it is due, not a promise. A job that fails {MAX_FAILS} times in a row switches itself off and tells you on Telegram. Switching off needs no sign-in. Switching on does.</p></Card>
    <Card><div className="ax-scroll"><table className="ax-table"><caption>Planned jobs that are not built yet. None of these runs</caption>
      <thead><tr><th scope="col">Job</th><th scope="col">Planned schedule</th><th scope="col">Where</th><th scope="col">Today</th></tr></thead>
      <tbody>{planned.map(a => <tr key={a.id}><th scope="row">{a.id}<span className="ax-n ax-sub">{a.does}</span></th><td>{a.schedule}</td><td>{a.where === 'vercel' ? 'This dashboard' : 'GitHub Actions'}</td><td>{a.note ?? 'Not built'}</td></tr>)}</tbody></table></div></Card>
  </div>;
}
