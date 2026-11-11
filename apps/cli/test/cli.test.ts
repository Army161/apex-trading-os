import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main, parse } from '../src/main';
import { makeCtx, sendTelegram, execute } from '../src/runtime';

const ROOT = resolve(__dirname, '../../..');
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'apex-cli-')); return makeCtx(ROOT, { APEX_STATE_DIR: dir }, () => Date.UTC(2026, 10, 11, 12)); };
const run = async (ctx: ReturnType<typeof fresh>, ...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };

test('argument parsing', () => {
  assert.deepEqual(parse(['run', '--full', '--seed', 'plan:P1.13', '--budget=5']), { _: ['run'], flags: { full: true, seed: 'plan:P1.13', budget: '5' } });
  assert.deepEqual(parse(['ledger', 'tail', '-n', '3']), { _: ['ledger', 'tail'], flags: { n: '3' } });
});

test('a dry run writes nothing; a real run writes a verified ledger and a report that opens with the paper notice', async () => {
  const ctx = fresh(), dry = await run(ctx, 'run', '--dry-run', '--budget', '2');
  assert.equal(dry.code, 0); assert.match(dry.text, /Dry run: nothing was written/); assert.ok(!existsSync(join(ctx.stateDir, 'ledger.jsonl')));
  const real = await run(ctx, 'run', '--budget', '2'); assert.equal(real.code, 0);
  assert.equal(real.text.split('\n')[2], 'Paper mode. Nothing here is proven or guaranteed.');
  const lines = readFileSync(join(ctx.stateDir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines.filter(e => e.kind === 'trial_result').length, 2); assert.ok(lines.findIndex(e => e.kind === 'prereg') < lines.findIndex(e => e.kind === 'trial_result'));
  assert.equal((await run(ctx, 'ledger', 'verify')).code, 0); assert.match((await run(ctx, 'report')).text, /## 10\. Ledger/);
  assert.match((await run(ctx, 'status')).text, /Trials ever \(N\): 2/); assert.match((await run(ctx, 'board')).text, /In-sample results on past data/);
  assert.ok(!existsSync(join(ctx.stateDir, 'run.lock')), 'the run lock is released');
});

test('halt pulls the cord in the ledger, the next run sees it, and there is no resume command', async () => {
  const ctx = fresh(); assert.equal((await run(ctx, 'halt')).code, 2);
  assert.match((await run(ctx, 'halt', 'testing', 'the', 'cord')).text, /Andon cord pulled/);
  assert.match((await run(ctx, 'status')).text, /Halts: andon cord/); assert.match((await run(ctx, 'risk')).text, /andon PULLED/);
  const r = await execute(ctx, { mode: 'tick', budget: 1 }); assert.ok(r.out.report.status.halts.some(h => /andon/.test(h)));
  const res = await run(ctx, 'resume'); assert.equal(res.code, 2); assert.match(res.text, /Unknown command/);
});

test('there is no command that places, sizes or sends an order, and none that goes live', async () => {
  const ctx = fresh();
  for (const c of ['order', 'buy', 'sell', 'withdraw', 'pay', 'transfer', 'go-live']) assert.equal((await run(ctx, c)).code, 2, c);
  const live = await run(ctx, 'live', 'status'); assert.equal(live.code, 0); assert.match(live.text, /Live trading is off/);
  assert.equal((await run(ctx, 'run', '--seed', 'anything')).code, 2, 'a seed batch must name an approved plan item');
});

test('doctor, fingerprints, data health, strategies and costs all read without writing', async () => {
  const ctx = fresh(), d = await run(ctx, 'doctor'); assert.equal(d.code, 0); assert.match(d.text, /fingerprints\s+yes/);
  assert.equal((await run(ctx, 'strategies', 'fingerprint', '--check')).code, 0); assert.match((await run(ctx, 'strategies', 'list')).text, /dave_prev_range/);
  assert.match((await run(ctx, 'data', 'health')).text, /csv:SPY:1h:split/); assert.match((await run(ctx, 'costs')).text, /assumed/);
  assert.ok(!existsSync(join(ctx.stateDir, 'ledger.jsonl')));
});

test('telegram: nothing is sent without both settings, and a failure never echoes the token', async () => {
  assert.deepEqual(await sendTelegram({}, 'hi'), { sent: false, why: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' });
  const tok = ['123456', 'abcDEF'].join(':'), calls: string[] = [];
  const ok = await sendTelegram({ TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: '1' }, 'hi', (async (u: any) => { calls.push(String(u)); return { ok: true, status: 200 }; }) as any); assert.equal(ok.sent, true); assert.equal(calls.length, 1);
  const bad = await sendTelegram({ TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: '1' }, 'hi', (async (u: any) => { throw new Error(`connect failed ${u}`); }) as any);
  assert.equal(bad.sent, false); assert.ok(!bad.why!.includes(tok));
});

test('data pull: without a key nothing is fetched; with one, new bars are appended in the state directory and the committed file is untouched', async () => {
  const { pullData, loadData } = await import('../src/runtime');
  const none = fresh(), r0 = await pullData(none, (async () => { throw new Error('must not be called'); }) as any); assert.deepEqual(r0.pulled, []); assert.match(r0.problems[0], /MASSIVE_API_KEY is not set/);
  const dir = mkdtempSync(join(tmpdir(), 'apex-pull-')), ctx = makeCtx(ROOT, { APEX_STATE_DIR: dir, MASSIVE_API_KEY: 'test-key' }, () => 1794270600000 + 6 * 3600e3);
  const before = loadData(ctx).datasets.find(d => d.spec.id === 'csv:SPY:1h:split')!, committed = readFileSync(join(ROOT, 'data/spy_30m.csv'), 'utf8'), seen: { url: string; auth?: string }[] = [];
  const fake = async (url: string, init?: any) => { seen.push({ url, auth: init?.headers?.Authorization }); const spy = url.includes('/ticker/SPY/');
    return { ok: true, status: 200, json: async () => ({ results: spy ? [1, 2, 3, 4].map(k => ({ t: 1794270600000 + k * 18e5, o: 752.5, h: 753, l: 752, c: 752.8, v: 1000 })) : [] }) }; };
  const r = await pullData(ctx, fake as any, async () => {});
  assert.deepEqual(r.problems, []); assert.equal(r.pulled.length, 8, 'eight base files behind the twelve datasets'); assert.match(r.pulled.find(x => x.startsWith('SPY'))!, /4 new bars/);
  assert.ok(seen.every(s => s.auth === 'Bearer test-key' && !s.url.includes('test-key')), 'the key travels in a header, never in the URL');
  assert.ok(seen.some(s => s.url.includes(encodeURIComponent('C:EURUSD'))) && seen.some(s => s.url.includes(encodeURIComponent('X:BTCUSD'))));
  const after = loadData(ctx).datasets.find(d => d.spec.id === 'csv:SPY:1h:split')!;
  assert.equal(after.bars.length, before.bars.length + 2); assert.notEqual(after.version, before.version); assert.deepEqual(after.bars.slice(0, before.bars.length - 1), before.bars.slice(0, -1), 'history is unchanged');
  assert.equal(readFileSync(join(ROOT, 'data/spy_30m.csv'), 'utf8'), committed);
});

test('claim: a saved extraction is checked, tested through the gate and recorded; the command line never calls a model', async () => {
  const ctx = fresh(), src = 'archive/chat/03-turtle-breakout-ai-trading-bot-tradingview.md', fx = 'packages/claims/test/fixtures/turtle.extraction.json';
  const none = await run(ctx, 'claim', src); assert.equal(none.code, 2); assert.match(none.text, /never calls a model/);
  const req = await run(ctx, 'claim', src, '--request'); assert.equal(req.code, 0); assert.deepEqual(Object.keys(JSON.parse(req.text)).sort(), ['maxTokens', 'schema', 'system', 'user']);
  const dry = await run(ctx, 'claim', src, '--extraction', fx, '--dry-run'); assert.equal(dry.code, 0); assert.match(dry.text, /## Verdict: No edge found/); assert.ok(!existsSync(join(ctx.stateDir, 'ledger.jsonl')));
  const real = await run(ctx, 'claim', src, '--extraction', fx); assert.equal(real.code, 0); assert.match(real.text, /Tries used by this check: 1 new of 1 run/); assert.ok(!/Hidden text/.test(real.text));
  const lines = readFileSync(join(ctx.stateDir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(e => e.kind), ['gate_version', 'prereg', 'trial_result', 'claim_check']); assert.equal(lines[1].payload.strategy.id, 'turtle_55_20'); assert.match(lines[1].payload.source, /^claim:chk_/);
  assert.equal((await run(ctx, 'ledger', 'verify')).code, 0); assert.match((await run(ctx, 'status')).text, /Trials ever \(N\): 1/);
  const again = await run(ctx, 'claim', src, '--extraction', fx); assert.match(again.text, /Tries used by this check: 0 new of 1 run/); assert.match(again.text, /already in the ledger, not counted again/);
  // The nightly run then treats that pair as already tried: it is not registered a second time.
  await run(ctx, 'run', '--budget', '400'); const after = readFileSync(join(ctx.stateDir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(after.filter(e => e.kind === 'prereg' && e.payload.strategy.id === 'turtle_55_20' && e.payload.panel === 'csv:BTC:1d:raw').length, 1);
});
