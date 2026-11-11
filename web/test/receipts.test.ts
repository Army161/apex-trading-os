// The public receipts page (docs/design/04 s3.4, build plan P4.13). What is held here: the page is off until switched on by a
// signed-in session, what it publishes carries no money amount, size, limit or setting, every entry number it shows has the
// hash the ledger has, and retired slots stay. The steps it tells a reader to follow are run in apps/cli/test/anchor.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ledger, MemoryLedgerStore, loadConfig, type LedgerEntry } from '@apex/kernel';
import { buildView } from '@apex/kernel/view';
import { publicReceipts, receiptsOn, setReceipts } from '../lib/receipts';

const web = resolve(__dirname, '..'), src = (p: string) => readFileSync(join(web, p), 'utf8');
const ENTRIES: LedgerEntry[] = readFileSync(join(web, '../apps/cli/fixtures/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), cap = loadConfig({}, 'cli').paperCapital;

test('switch: off by default, and only a signed-in call from the dashboard changes it', async () => {
  assert.equal(await receiptsOn(), false); await setReceipts(true); assert.equal(await receiptsOn(), true); await setReceipts('yes' as any); assert.equal(await receiptsOn(), false, 'anything but true is off');
  const r = src('app/api/admin/settings/receipts/route.ts'), post = r.slice(r.indexOf('export async function POST'));
  const order = ['isAdmin()', "req.headers.get('origin')", "typeof b?.on !== 'boolean'", 'setReceipts('].map(x => post.indexOf(x)); assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), String(order));
  // The page does not exist while the switch is off: that check comes before the ledger is read.
  const page = src('app/receipts/page.tsx'); assert.ok(page.indexOf('if (!(await receiptsOn())) notFound()') > 0 && page.indexOf('if (!(await receiptsOn())) notFound()') < page.indexOf('loadLedger()'));
  assert.doesNotMatch(src('lib/routes.json'), /receipts/, 'it is not in the navigation'); assert.doesNotMatch(src('public/sw.js'), /receipts/);
});

test('private: nothing with a money amount, a size, a limit or a setting is published', () => {
  const v = buildView(ENTRIES, cap), d = publicReceipts(v, ENTRIES), text = JSON.stringify(d);
  const keys = new Set<string>(); JSON.parse(text, (k, x) => { if (k && !/^\d+$/.test(k)) keys.add(k); return x; });
  assert.deepEqual([...keys].sort(), ['anchors', 'avgR', 'closed', 'covers', 'date', 'entries', 'entry', 'exit', 'file', 'fill', 'hash', 'head', 'lastAnchored', 'lastCheck', 'lock', 'locked', 'market', 'month', 'n', 'name', 'r', 'role', 'seq', 'side', 'slots', 'state', 'status', 'strategy', 'timeframe', 'totalR', 'trades', 'wins'].filter(k => keys.has(k)));
  for (const k of keys) assert.doesNotMatch(k, /qty|pnl|cash|equity|risk|capital|limit|price|fee|weight|usd|key|token|actor|payload/i, k);
  // No figure on the page is one of the book's money figures or sizes.
  const money = new Set<number>(); for (const c of v.closed) for (const x of [c.pnl, c.qty, c.entry, c.exit]) money.add(Math.round(x * 100) / 100); money.add(v.cash); money.add(cap);
  JSON.parse(text, (k, x) => { if (typeof x === 'number' && !['seq', 'covers', 'n', 'wins', 'entries', 'lastAnchored'].includes(k) && Math.abs(x) > 50) assert.ok(!money.has(Math.round(x * 100) / 100), `${k}=${x} is a money figure`); return x; });
  // The page and its data read the ledger and the view only: not the queries that carry the book, and not the config's limits.
  for (const f of ['lib/receipts.ts', 'app/receipts/page.tsx']) assert.doesNotMatch(src(f), /\.pnl\b|\.qty\b|\.cash\b|riskUsd|\.weight\b|limits|paperCapital|@\/lib\/queries|process\.env|money\(/, f);
});

test('receipts: every entry number shown has the ledger\'s own hash, the counts are the view\'s, and retired slots stay', async () => {
  const v = buildView(ENTRIES, cap), d = publicReceipts(v, ENTRIES), at = (seq: number) => ENTRIES[seq - 1];
  assert.deepEqual(d.head, { seq: ENTRIES.at(-1)!.seq, hash: ENTRIES.at(-1)!.hash }); assert.equal(d.slots.length, v.slots.size); assert.ok(d.slots.length > 0);
  let trades = 0;
  for (const s of d.slots) { const closed = v.closed.filter(c => c.slotKey === s.name); trades += s.n;
    assert.equal(s.n, closed.length, s.name); assert.equal(s.lock!.hash, at(s.lock!.seq).hash); assert.equal(at(s.lock!.seq).kind, 'slot_locked');
    if (s.lastCheck) assert.equal(at(s.lastCheck.seq).kind, 'graduation_check');
    s.trades.forEach((t, i) => { assert.equal(at(t.fill.seq).hash, t.fill.hash); assert.equal(at(t.fill.seq).kind, 'fill'); assert.equal(at(t.fill.seq).payload.slotKey, s.name); assert.equal(at(t.entry!.seq).payload.kind, 'entry'); assert.ok(t.entry!.seq < t.fill.seq);
      assert.equal(t.r, Math.round(closed[i].r * 1e4) / 1e4); assert.equal(t.closed, new Date(closed[i].exitT).toISOString().slice(0, 10)); });
    assert.equal(s.wins, closed.filter(c => c.r > 0).length); }
  assert.ok(trades > 0, 'the demo ledger has closed trades to show');
  // A retired slot is still listed, and an anchor made afterwards covers what came before it.
  const ledger = new Ledger(new MemoryLedgerStore([...ENTRIES]), () => ENTRIES.at(-1)!.ts + 1000), first = d.slots[0], head = ENTRIES.at(-1)!;
  await ledger.append('slot_status', 'test', { slotKey: first.name, from: first.status, to: 'retired', reason: 'test' }); const a = await ledger.append('anchor', 'cli', { seq: head.seq + 1, hash: 'f'.repeat(64), file: 'heads/2026-11-11.json' });
  const all = await (ledger as any).store.read() as LedgerEntry[], d2 = publicReceipts(buildView(all, cap), all);
  assert.equal(d2.slots.find(s => s.name === first.name)!.status, 'retired'); assert.equal(d2.slots.find(s => s.name === first.name)!.n, first.n);
  assert.deepEqual(d2.anchors[0], { seq: a.seq, hash: 'f'.repeat(64), covers: head.seq + 1, date: new Date(a.ts).toISOString().slice(0, 10), file: 'heads/2026-11-11.json' }); assert.equal(d2.lastAnchored, head.seq + 1);
  // The page tells a reader to run commands that exist.
  const page = src('app/receipts/page.tsx'), cli = src('../apps/cli/src/main.ts'); for (const sub of ['verify', 'show']) { assert.match(page, new RegExp(`npm run apex -- ledger ${sub}`)); assert.match(cli, new RegExp(`sub === '${sub}'`)); }
});
