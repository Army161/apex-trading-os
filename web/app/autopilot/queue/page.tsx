import { Metric, count } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { queue } from '@/lib/queries';
import { Card, NoLedger } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Research queue' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const q = queue(l.view, l.entries, l.cfg.trialsPerWeek, l.now), ctx = { n: q.budget, nLabel: 'tries allowed a week', basis: 'book' as const };
  return <div className="grid">
    <div className="grid g2">
      <Card><Metric label="Tries used in the last 7 days" value={q.used} unit="count" {...ctx} size="page" /><p className="ax-n">Every try makes a lucky result more likely, so tries are rationed. When the week's {count(q.budget)} are used, new pairs wait.</p></Card>
      <Card><Metric label="Pairs waiting for budget" value={q.waiting} unit="count" {...ctx} /><p className="ax-n">As the last run counted them. They run in the order they were registered, oldest first.</p></Card>
    </div>
    <Card>{q.items.length ? <div className="ax-scroll"><table className="ax-table"><caption>Where the tries came from, newest first</caption>
      <thead><tr><th scope="col">Source</th><th scope="col">First registered</th><th scope="col" className="ax-num">Pairs</th><th scope="col" className="ax-num">Run</th><th scope="col" className="ax-num">Passed</th><th scope="col" className="ax-num">Near misses</th></tr></thead>
      <tbody>{q.items.map(i => <tr key={i.source}><th scope="row">{i.label} <code>{i.source.slice(0, 40)}</code></th><td><LocalTime t={i.firstTs} date /></td><td className="ax-num">{count(i.pairs)}</td><td className="ax-num">{count(i.done)}</td><td className="ax-num">{count(i.passed)}</td><td className="ax-num">{count(i.nearMiss)}</td></tr>)}</tbody></table></div>
      : <p className="ax-n">Nothing has been registered yet.</p>}
      <p className="ax-n">A test is written down before it runs, and it is never edited afterwards. Ideas are added from the terminal for now: <code>npm run apex -- queue</code>.</p></Card>
  </div>;
}
