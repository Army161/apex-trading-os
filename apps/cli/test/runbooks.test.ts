// The runbooks (docs/runbooks) are held to the program here, so a page cannot name a command that is not there, and the
// steps a page gives are run once on a copy of the demo ledger (docs/design/14, P4.14: "each runbook rehearsed once on fixtures").
// What cannot be rehearsed here is said on the page itself: the dashboard resume, a database restore, key rotation at a provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LEDGER_KINDS } from '@apex/kernel';
import { COMMANDS, GLOBAL_FLAGS, main } from '../src/main';
import { makeCtx, type Ctx } from '../src/runtime';
import { FIXTURE_LEDGER } from '../src/source';

const ROOT = resolve(__dirname, '../../..'), DIR = join(ROOT, 'docs/runbooks'), now = Date.UTC(2026, 10, 11, 23, 55);
const PAGES = readdirSync(DIR).filter(f => f.endsWith('.md') && f !== 'README.md').sort();
const text = (f: string) => readFileSync(join(DIR, f), 'utf8');
const PARTS = ['How you notice', 'Safe first step', 'Steps', 'How to confirm', 'What to write down'];
function fresh(): Ctx { const dir = mkdtempSync(join(tmpdir(), 'apex-runbook-')); copyFileSync(FIXTURE_LEDGER, join(dir, 'ledger.jsonl')); return makeCtx(ROOT, { APEX_STATE_DIR: dir }, () => now); }
const run = async (ctx: Ctx, ...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };
const lines = (ctx: Ctx) => readFileSync(join(ctx.stateDir, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean);
const SLOT = 'demo_alpha@csv:SPY:1h:split';
/** Every `npm run apex -- ...` on a page, as the words after the dashes. A quoted reason stays one word. */
function commands(f: string): string[][] {
  return [...text(f).matchAll(/`npm run apex -- ([^`]+)`/g)].map(m => [...m[1].matchAll(/"([^"]*)"|(\S+)/g)].map(w => w[1] ?? w[2]));
}
const fill = (w: string) => w === '<key>' || w === '<slot>' ? SLOT : w === '<strategy>' ? 'demo_alpha' : w === '<dataset>' ? 'csv:SPY:1h:split' : w === '<reason>' ? 'runbook rehearsal' : w;

test('runbooks: the index lists every page, and every page has the same five parts in the same order', () => {
  const index = [...text('README.md').matchAll(/\]\(([a-z-]+\.md)\)/g)].map(m => m[1]).sort();
  assert.deepEqual(index, PAGES);
  for (const f of PAGES) {
    assert.match(text(f), /^# \S/, f);
    assert.deepEqual([...text(f).matchAll(/^## (.+)$/gm)].map(m => m[1]), PARTS, f);
    for (const link of text(f).matchAll(/`([a-z-]+\.md)`/g)) assert.ok(PAGES.includes(link[1]), `${f} points at ${link[1]}`);
  }
});

test('runbooks: every command a page names exists, with its sub-command, flags and ledger kind', () => {
  let n = 0;
  for (const f of ['README.md', ...PAGES]) for (const c of commands(f)) {
    if (c[0] === '<command>') continue; n++;
    const cmd = COMMANDS[c[0]]; assert.ok(cmd, `${f}: apex ${c[0]} is not a command`);
    if (cmd.subs && c[1] && !/^[-<]/.test(c[1])) assert.ok(cmd.subs.includes(c[1]), `${f}: apex ${c[0]} ${c[1]}`);
    c.forEach((w, i) => { if (!w.startsWith('--')) return; const flag = w.slice(2);
      assert.ok([...(cmd.flags ?? []), ...GLOBAL_FLAGS].includes(flag), `${f}: apex ${c[0]} has no ${w}`);
      if (flag === 'kind') assert.ok((LEDGER_KINDS as readonly string[]).includes(c[i + 1]), `${f}: ${c[i + 1]} is not a ledger kind`); });
  }
  assert.ok(n >= 25, 'the pages name their commands');
});

test('runbooks: each page\'s commands run, in order, on a copy of the demo ledger', async () => {
  for (const f of PAGES) {
    const ctx = fresh(), before = lines(ctx).length; let halts = 0, wrote = false;
    for (const c of commands(f)) {
      const argv = c.map(fill), r = await run(ctx, ...argv), what = `${f}: apex ${argv.join(' ')}`;
      // Remote mode has no dashboard to reach here: it must say what it needs and stop, never fall back to the local ledger.
      if (argv.includes('--remote')) { assert.equal(r.code, 2, what); assert.match(r.text, /APEX_API_URL and APEX_API_KEY/); continue; }
      assert.equal(r.code, 0, `${what}\n${r.text.slice(0, 400)}`); assert.ok(r.text.length > 0, what);
      if (argv[0] === 'halt') halts++;
      // `validate` is the one command a page asks for that records a run. The registry says so, and a dry run does not.
      if (COMMANDS[argv[0]].writes?.includes('ledger entries') && !argv.includes('--dry-run')) wrote = true;
    }
    // Otherwise a page's commands read: the only entries a rehearsal adds are the halts it pulls. Either way the chain holds.
    if (wrote) assert.equal(f, 'validator-disagrees.md'); else assert.equal(lines(ctx).length, before + halts, `${f} wrote to the ledger`);
    assert.equal((await run(ctx, 'ledger', 'verify')).code, 0, f);
  }
});

test('runbooks: halt, then every surface says so, and a dry run writes nothing while halted', async () => {
  const ctx = fresh(), before = lines(ctx).length;
  assert.equal((await run(ctx, 'halt', 'x')).code, 2, 'a halt needs a reason');
  assert.equal((await run(ctx, 'halt', 'rehearsal: stop everything')).code, 0);
  const last = JSON.parse(lines(ctx)[before]); assert.equal(last.kind, 'halt'); assert.equal(last.payload.reason, 'rehearsal: stop everything');
  const s = await run(ctx, 'status'); assert.equal(s.code, 0); assert.match(s.text, /rehearsal: stop everything/);
  assert.equal(JSON.parse((await run(ctx, 'status', '--json')).text).halted, true);
  assert.match((await run(ctx, 'risk')).text, /andon/);
  const d = await run(ctx, 'run', '--dry-run'); assert.equal(d.code, 0); assert.equal(lines(ctx).length, before + 1);
  // There is no resume command: the page sends you to the dashboard, where it is typed and signed in.
  assert.equal(COMMANDS.resume, undefined); assert.match(text('halt-and-resume.md'), /dashboard/i);
});

test('runbooks: a damaged ledger fails verify with code 4 and stops every writer, and a restored copy verifies and replays the same', async () => {
  const ctx = fresh(), p = join(ctx.stateDir, 'ledger.jsonl'), good = readFileSync(p, 'utf8'), replay = (await run(ctx, 'ledger', 'replay')).text;
  await run(ctx, 'ledger', 'anchor'); const anchored = readFileSync(p, 'utf8');
  // Someone edits a fill in the middle.
  const rows = anchored.split('\n').filter(Boolean), i = rows.findIndex(l => JSON.parse(l).kind === 'fill'), e = JSON.parse(rows[i]); e.payload.price += 1; rows[i] = JSON.stringify(e);
  writeFileSync(p, rows.join('\n') + '\n');
  const v = await run(ctx, 'ledger', 'verify'); assert.equal(v.code, 4); assert.match(v.text, new RegExp(`\\b${e.seq}\\b`), 'the first bad entry is named');
  assert.equal(JSON.parse((await run(ctx, 'ledger', 'verify', '--json')).text).ok, false);
  assert.match((await run(ctx, 'doctor')).text, /ledger\s+NO/);
  assert.equal((await run(ctx, 'ledger', 'anchor')).code, 4, 'a ledger that does not verify is not anchored');
  // Nothing is appended to a broken chain, the halt included, and the pipeline does not start on one. Each says why and exits 4.
  for (const c of [['halt', 'ledger does not verify'], ['run', '--dry-run'], ['run'], ['validate']]) { const r = await run(ctx, ...c); assert.equal(r.code, 4, c.join(' ')); assert.match(r.text, /does not verify \(entry \d+: .+\)\. Nothing was written/, c.join(' ')); }
  assert.equal(readFileSync(p, 'utf8'), rows.join('\n') + '\n');
  const st = await run(ctx, 'status'); assert.equal(st.code, 1); assert.match(st.text, /could not be read: ledger file is damaged at seq \d+/);
  // Restore (restore.md): keep the damaged copy under another name, put the last copy that verified back.
  renameSync(p, join(ctx.stateDir, 'ledger.damaged.jsonl')); writeFileSync(p, anchored);
  const ok = await run(ctx, 'ledger', 'verify'); assert.equal(ok.code, 0); assert.match(ok.text, /anchors 1 saved head matches the chain/);
  assert.equal((await run(ctx, 'ledger', 'replay')).text.replace(/\d+ entries/, ''), replay.replace(/\d+ entries/, ''));
  // A ledger cut short after an anchor is caught by the saved head, even though its own chain is whole.
  writeFileSync(p, good.split('\n').filter(Boolean).slice(0, 20).join('\n') + '\n');
  const cut = await run(ctx, 'ledger', 'verify'); assert.equal(cut.code, 4); assert.match(cut.text, /the ledger has no such entry/);
});
