// Dashboard commands for bots (pause, resume, kill). What is held here: a queued command reaches only the bot it targets, a
// heartbeat or trade report never reads it away, it is handed out on every poll until that bot acknowledges it by its ref (or a
// newer command replaces it), a stale ack changes nothing, and a halt wins while leaving the queued command in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setCommand, botControl, ackedRef, ackCommand, commandReply, botKey } from '../lib/bots';
import { ingest } from '../lib/ingest';

const web = join(import.meta.dirname, '..'), OFF = { on: false }, ON = { on: true, reason: 'fills disagree' };
const poll = async (id: string, kill = false, cord: { on: boolean; reason?: string } = OFF) => commandReply(kill, cord, await botControl(id), await ackedRef(id));

test('a queued pause survives heartbeats and trade reports from any bot, and reaches only its own bot', async () => {
  const ref = await setCommand('solana-copy', 'pause');
  for (const id of ['solana-copy', 'polymarket-copy', 'freqtrade']) {
    await ingest({ bot: { id, kind: 'x' }, type: 'heartbeat', status: { equity: 1 } });
    await ingest({ bot: { id, kind: 'x' }, type: 'trade', trade: { symbol: 'X', side: 'buy', qty: 1, status: 'open' } });
  }
  assert.deepEqual(await poll('solana-copy'), { command: 'pause', ref, halted: true, why: 'pause from the dashboard' });
  assert.deepEqual(await poll('solana-copy'), { command: 'pause', ref, halted: true, why: 'pause from the dashboard' }, 'a poll does not consume it');
  assert.equal((await poll('polymarket-copy')).command, null, 'another bot never gets it');
  assert.equal((await poll('polymarket-copy')).halted, false);
  assert.equal((await poll('solana-copy-2')).command, 'pause', 'a second instance under the same dashboard row gets it too');
});

test('only an ack with the current ref clears delivery; the bot stays halted after a pause or kill is acknowledged', async () => {
  const ref = await setCommand('day-trader', 'kill');
  assert.equal(await ackCommand('day-trader', 'not-the-ref'), 'stale');
  assert.equal(await ackCommand('alpaca-core-sleeves', ref), 'stale', 'another bot cannot acknowledge it');
  assert.equal(await ackCommand('day-trader', ''), 'stale');
  assert.equal((await poll('day-trader')).command, 'kill');
  assert.equal(await ackCommand('day-trader', ref), 'acked');
  assert.deepEqual(await poll('day-trader'), { command: null, ref: null, halted: true, why: 'kill from the dashboard' });
  // A newer command replaces it, and the old ref can no longer acknowledge anything.
  const next = await setCommand('day-trader', 'resume');
  assert.equal(await ackCommand('day-trader', ref), 'stale');
  assert.deepEqual(await poll('day-trader'), { command: 'resume', ref: next, halted: false, why: null });
  assert.equal(await ackCommand('day-trader', next), 'acked');
  assert.deepEqual(await poll('day-trader'), { command: null, ref: null, halted: false, why: null });
});

test('a halt wins, hands out no ackable ref, and leaves the queued command for after release', async () => {
  const ref = await setCommand('freqtrade', 'resume');
  assert.deepEqual(await poll('freqtrade', true), { command: 'pause', ref: null, halted: true, why: 'kill switch is on' });
  assert.deepEqual(await poll('freqtrade', false, ON), { command: 'pause', ref: null, halted: true, why: 'andon cord: fills disagree' });
  assert.deepEqual(await poll('freqtrade'), { command: 'resume', ref, halted: false, why: null });
});

test('commandReply: pure cases, including an unknown stored command read as pause', async () => {
  assert.deepEqual(commandReply(false, OFF, null, null), { command: null, ref: null, halted: false, why: null });
  assert.equal(commandReply(false, OFF, { command: 'pause', ref: 'a', at: 1 }, 'a').halted, true);
  assert.equal(commandReply(true, OFF, null, null).halted, true);
  assert.equal(botKey('maker-clip-keeper-eth'), 'maker-clip-keeper');
  const { setJSON } = await import('../lib/store');
  await setJSON(`cmd:${botKey('engine-paper')}`, { command: 'order-now', at: 5 });
  assert.deepEqual(await poll('engine-paper'), { command: 'pause', ref: 'c5', halted: true, why: 'pause from the dashboard' });
});

test('the routes: ingest never touches the queue; the command route acknowledges only with the bot token', () => {
  const ingestSrc = readFileSync(join(web, 'app/api/ingest/route.ts'), 'utf8');
  assert.doesNotMatch(ingestSrc, /takeCommand|botControl|ackCommand|setCommand|cmd:/);
  assert.match(ingestSrc, /botCommand\(await getJSON\('killswitch', false\), await cord\(\), null\)/);
  const cmd = readFileSync(join(web, 'app/api/bots/[id]/command/route.ts'), 'utf8');
  assert.match(cmd, /export async function DELETE[\s\S]*?if \(!\(await ingestOk\(req\)\)\) return/);
  assert.match(cmd, /export async function POST[\s\S]*?if \(!\(await isAdmin\(\)\)\) return/);
  assert.doesNotMatch(readFileSync(join(web, 'lib/bots.ts'), 'utf8'), /takeCommand/);
});
