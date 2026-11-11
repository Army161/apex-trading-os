// Anchoring (docs/design/04 s3.4): the head is saved once a day, the ledger says so, and a ledger changed after an anchor
// no longer verifies. These are the steps the receipts page tells a reader to follow, run here for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../src/main';
import { makeCtx, type Ctx } from '../src/runtime';
import { FIXTURE_LEDGER } from '../src/source';
import { checkHeads, planAnchor, readHeads } from '../src/anchor';

const ROOT = resolve(__dirname, '../../..'); let now = Date.UTC(2026, 10, 11, 23, 55);
function fresh(env: Record<string, string> = {}): Ctx { const dir = mkdtempSync(join(tmpdir(), 'apex-anchor-')); copyFileSync(FIXTURE_LEDGER, join(dir, 'ledger.jsonl')); return makeCtx(ROOT, { APEX_STATE_DIR: dir, ...env }, () => now); }
const run = async (ctx: Ctx, ...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };
const lines = (ctx: Ctx) => readFileSync(join(ctx.stateDir, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean);

test('anchor: saves the head once, records it, and verify checks it', async () => {
  const ctx = fresh(), before = lines(ctx), head = JSON.parse(before[before.length - 1]);
  assert.match((await run(ctx, 'ledger', 'verify')).text, /anchors no head has been saved yet/);
  const a = await run(ctx, 'ledger', 'anchor'); assert.equal(a.code, 0); assert.match(a.text, new RegExp(`Anchored entry ${head.seq} \\(${head.hash.slice(0, 12)}\\) in heads/2026-11-11\\.json`));
  assert.deepEqual(JSON.parse(readFileSync(join(ctx.stateDir, 'heads/2026-11-11.json'), 'utf8')), { seq: head.seq, hash: head.hash, entries: before.length });
  const after = lines(ctx), last = JSON.parse(after[after.length - 1]); assert.equal(after.length, before.length + 1); assert.equal(last.kind, 'anchor'); assert.deepEqual(last.payload, { seq: head.seq, hash: head.hash, file: 'heads/2026-11-11.json' });
  // Again with nothing new: nothing is written.
  const again = await run(ctx, 'ledger', 'anchor'); assert.equal(again.code, 0); assert.match(again.text, /Nothing was added since the last anchor/); assert.equal(lines(ctx).length, after.length);
  const v = await run(ctx, 'ledger', 'verify'); assert.equal(v.code, 0); assert.match(v.text, /anchors 1 saved head matches the chain/);
  // The API's view of the head names the anchor.
  assert.match((await run(ctx, 'ledger', 'head')).text, new RegExp(String(head.seq)));
});

test('anchor: a ledger changed after an anchor, or a head that was edited, fails verify and is not anchored again', async () => {
  const ctx = fresh(); await run(ctx, 'ledger', 'anchor'); const p = join(ctx.stateDir, 'heads/2026-11-11.json'), good = readFileSync(p, 'utf8');
  // Someone edits the saved head.
  writeFileSync(p, good.replace(/"hash": "(.)/, (_m, c) => `"hash": "${c === 'a' ? 'b' : 'a'}`));
  const v = await run(ctx, 'ledger', 'verify'); assert.equal(v.code, 4); assert.match(v.text, /head saved on 2026-11-11 does not match entry \d+: the ledger was changed after that day/);
  const j = JSON.parse((await run(ctx, 'ledger', 'verify', '--json')).text); assert.equal(j.ok, false); assert.match(j.why, /does not match/);
  now += 864e5; const a = await run(ctx, 'ledger', 'anchor'); assert.equal(a.code, 4); assert.match(a.text, /does not verify.*nothing was anchored/); assert.equal(existsSync(join(ctx.stateDir, 'heads/2026-11-12.json')), false);
  writeFileSync(p, 'not json'); assert.equal((await run(ctx, 'ledger', 'verify')).code, 4);
  // A head that points past the end of the ledger (the ledger was cut short after the anchor).
  writeFileSync(p, JSON.stringify({ seq: 99999, hash: 'a'.repeat(64), entries: 99999 })); assert.match((await run(ctx, 'ledger', 'verify')).text, /the ledger has no such entry/);
  now -= 864e5;
});

test('anchor: off means off, and the pure pieces say what they will do', async () => {
  const off = fresh({ APEX_LEDGER_ANCHOR: 'off' }), n = lines(off).length; const r = await run(off, 'ledger', 'anchor'); assert.equal(r.code, 0); assert.match(r.text, /switched off/); assert.equal(lines(off).length, n);
  assert.deepEqual(planAnchor([], now), { skip: 'The ledger is empty, so there is nothing to anchor.' });
  assert.deepEqual(checkHeads([], readHeads(join(tmpdir(), 'apex-no-such-folder'))), { ok: true, checked: 0, badSeq: null, why: null });
  assert.match((await run(fresh(), 'ledger', 'anchor', '--remote')).text, /checkout|local|APEX_API_URL/i);
});
