// Agents, their jobs and the schedules (docs/design/06 s7). What is held here: the roster matches the design's table, no agent
// has a verb that moves money, runs a command, sends, signs or deletes, a job whose output fails its schema stores nothing,
// a used-up budget parks the job with one question, the scout fetches only from its hosts, the risk officer halts on each
// kind of reading and has no way to release, and a switched-off job is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { audit, decide, rosterRules, type Verb } from '../lib/policy';
import { SEED, ensureRoster } from '../lib/roster';
import { bookReadings, outbox, riskSpec, runJob, settle, type AgentIo, type Spec } from '../lib/agentjobs';
import { getJob, listJobs, snooze } from '../lib/jobs';
import { SCOUT_HOSTS, allowedUrl, scoutFetch, scoutHosts } from '../lib/scout';
import { AUTOMATIONS, nextRun, scheduled, setSwitch, states, switchable } from '../lib/automations';
import { MAX_FAILS } from '../lib/policy';

const web = resolve(__dirname, '..'), src = (p: string) => readFileSync(join(web, p), 'utf8');
const mem: Map<string, unknown> = (globalThis as any).__apexMem;
const today = () => `agents:used:${new Date().toISOString().slice(0, 10)}`;
function io() { const halts: [string, string][] = [], notes: string[] = []; let t = Date.UTC(2026, 10, 11, 12);
  const x: AgentIo = { halt: async (by, reason) => { halts.push([by, reason]); }, notify: async text => { notes.push(text); }, now: () => (t += 1000) }; return { x, halts, notes }; }
const note: Spec<{ title: string; body: string }> = { agent: 'validator', kind: 'test-note', title: 'A note', input: { n: 1 },
  validate: raw => { const r = raw as any; if (typeof r?.title !== 'string' || typeof r?.body !== 'string' || !r.body) throw new Error('needs a title and a body'); return r; },
  out: v => [{ verb: 'write_file', kind: 'note', title: v.title, text: v.body }] };

test('roster: the seed is the design table, verb for verb', async () => {
  const twin = JSON.parse(src('../packages/kernel/test/roster.json')).agents as { id: string; verbs: Verb[]; model: string; jobsPerDay: number }[];
  assert.deepEqual(SEED.map(a => ({ id: a.id, verbs: a.tools, model: a.model, jobsPerDay: a.jobsPerDay })), twin);
  // The design's own table says the same (docs/design/06 s2): each agent's row lists exactly these verbs.
  const doc = src('../docs/design/06-agents-and-automations.md');
  for (const a of twin) { const row = doc.split('\n').find(l => l.startsWith(`| \`${a.id}\``)); assert.ok(row, `${a.id} is in the design table`);
    const cell = row.split('|')[3].replace(/\(.*?\)/g, ''); assert.deepEqual(cell.split(',').map(s => s.trim()).sort(), [...a.verbs].sort(), `${a.id} verbs`); }
  // The stored roster is overwritten from the seed, so a wider card in the store does not survive.
  mem.set('agents:roster', [{ ...SEED[0], tools: ['read', 'order', 'shell'], jobsPerDay: 999 }, { id: 'guest', role: 'guest', project: 'x', purpose: 'p', tools: ['read'], jobsPerDay: 1, tokenBudget: 1, approval: 'ask', updated: 1 }]);
  const r = await ensureRoster(); assert.deepEqual(r.find(a => a.id === 'scout')!.tools, ['read', 'analyze', 'browse', 'write_file']); assert.equal(r.find(a => a.id === 'scout')!.jobsPerDay, 3); assert.ok(r.some(a => a.id === 'guest'));
  mem.delete('agents:roster');
});

test('verbs: no agent can run a command, send, sign, delete or touch money, on a schedule or otherwise, and none can release a halt', async () => {
  const roster = await ensureRoster(), rules = rosterRules(roster, {});
  for (const a of SEED) for (const verb of ['shell', 'send', 'sign', 'delete', 'order', 'pay', 'withdraw', 'transfer'] as Verb[]) for (const trigger of ['routine', 'agent', 'person'] as const)
    assert.equal(decide({ agent: a.id, verb, trigger }, rules).allow, false, `${a.id} ${verb} ${trigger}`);
  // Even a rule that allows everything does not get a money verb or a scheduled command through.
  const open = [{ id: 'all', effect: 'allow' as const, when: () => true }];
  for (const verb of ['order', 'pay', 'withdraw', 'transfer'] as Verb[]) assert.equal(decide({ agent: 'scout', verb, trigger: 'person' }, open).rule, 'no-money-tools');
  assert.equal(decide({ agent: 'scout', verb: 'shell', trigger: 'routine' }, open).rule, 'no-shell-from-routine');
  assert.deepEqual(SEED.filter(a => a.tools.includes('halt')).map(a => a.id), ['risk-officer']);
  // There is no verb for releasing or resuming, and the job runner and its wiring never name the release.
  assert.doesNotMatch(src('lib/policy.ts').match(/export type Verb = [^;]+;/)![0], /release|resume|approve|live/);
  for (const f of ['lib/agentjobs.ts', 'lib/agentio.ts', 'lib/roster.ts', 'lib/scout.ts', 'lib/automations.ts', 'app/api/cron/officer/route.ts', 'app/api/automations/route.ts'])
    assert.doesNotMatch(src(f), /releaseCord|ledgerResume|api\/(resume|killswitch|admin|live)|autopilot\/(src\/)?broker|setJSON\('(andon|killswitch)'/, `${f} has no way to release, resume or trade`);
});

test('jobs: output that fails its schema twice fails the job and stores nothing; a good second answer is stored once', async () => {
  const { x } = io(); let calls = 0; const before = (await outbox()).length;
  const bad = await runJob({ ...note, model: async (_i, problem) => { calls++; assert.equal(problem, calls === 1 ? null : 'needs a title and a body'); return { raw: { title: 'x' }, tokens: 10 }; } }, x);
  assert.equal(bad.stage, 'failed'); assert.equal(calls, 2); assert.match(bad.notes.at(-1)!.text, /did not match the job's schema twice, so nothing was stored/); assert.equal((await outbox()).length, before);
  calls = 0;
  const good = await runJob({ ...note, model: async () => ({ raw: ++calls === 1 ? 'nonsense' : { title: 'Disagreement on SPY 1h', body: 'The re-run gave 6 of 7. token=abcdef123456' }, tokens: 10 }) }, x);
  assert.equal(good.stage, 'done'); const files = await outbox(); assert.equal(files.length, before + 1); assert.equal(files[0].agent, 'validator'); assert.equal(files[0].kind, 'note');
  assert.doesNotMatch(files[0].text, /abcdef123456/, 'a secret-looking string is not kept');
  // The audit row of each action exists, and the write is logged as a step of the job, not a second job.
  const rows = (await audit(20)).filter(r => r.agent === 'validator'); assert.ok(rows.some(r => r.verb === 'write_file' && r.allow)); assert.ok(rows.some(r => r.verb === 'analyze' && r.allow));
  assert.equal((mem.get(today()) as any).validator, 2, 'two jobs counted, not three');
  // An agent cannot put out something its card does not allow.
  const over = await runJob({ ...note, agent: 'claim-extractor', code: () => ({ title: 't', body: 'b' }) }, x);
  assert.equal(over.stage, 'failed'); assert.match(over.notes.at(-1)!.text, /Refused by the rule "default-deny"/); assert.equal((await outbox()).length, before + 1);
  const stranger = await runJob({ ...note, agent: 'nobody', code: () => ({ title: 't', body: 'b' }) }, x); assert.equal(stranger.stage, 'failed');
});

test('budgets: a used-up job budget or token budget parks the job with one question, and the Inbox answer is checked', async () => {
  const { x } = io(); mem.set(today(), { ...(mem.get(today()) as object), validator: 20 });
  const parked = await runJob({ ...note, code: () => ({ title: 't', body: 'b' }) }, x);
  assert.equal(parked.stage, 'needs_you'); assert.match(parked.ask!.question, /validator has used its 20 jobs for today\. What should happen to this job\?/); assert.deepEqual(parked.ask!.options, ['Run it again now', 'Drop it']);
  await assert.rejects(settle(parked.id, 'Raise my budget', x), /must be one of/);
  const s = await snooze(parked.id, 24, 1000); assert.equal(s.snoozedUntil, 1000 + 24 * 3600e3); assert.equal(s.stage, 'needs_you');
  const dropped = await settle(parked.id, 'Drop it', x); assert.equal(dropped.stage, 'failed'); assert.equal(dropped.ask, undefined); assert.equal(dropped.snoozedUntil, undefined);
  await assert.rejects(settle(parked.id, 'Drop it', x), /not waiting on a question/);
  // Token budget: the model is not called once the day's tokens are used.
  mem.set(today(), { ...(mem.get(today()) as object), validator: 0 }); let called = 0;
  const big = await runJob({ ...note, model: async () => { called++; return { raw: 'bad', tokens: 250_000 }; } }, x);
  assert.equal(called, 1); assert.equal(big.stage, 'needs_you'); assert.match(big.ask!.question, /token budget/);
  mem.delete(`agents:tokens:${new Date(x.now()).toISOString().slice(0, 10)}`);
});

test('scout: only https to a listed host is fetched, and a redirect off the list is not followed', async () => {
  const seen: string[] = [], fake = (async (u: any) => { seen.push(String(u)); return String(u).includes('/hop') ? new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }) : new Response('paper text'); }) as typeof fetch;
  for (const u of ['https://evil.example/a', 'http://arxiv.org/abs/1', 'https://arxiv.org.evil.example/', 'https://user:pw@arxiv.org/', 'https://arxiv.org:8443/', 'file:///etc/passwd', 'https://notarxiv.org/', 'not a url', 'https://169.254.169.254/'])
    assert.equal(allowedUrl(u), null, u);
  assert.ok(allowedUrl('https://export.arxiv.org/abs/1')); assert.ok(allowedUrl('https://www.sec.gov/x'));
  assert.deepEqual(scoutHosts({ APEX_SCOUT_HOSTS: 'nber.org, http://bad, ' }), [...SCOUT_HOSTS, 'nber.org']);
  const no = await scoutFetch('https://evil.example/a', { fetch: fake }); assert.equal(no.ok, false); assert.equal(seen.length, 0);
  const ok = await scoutFetch('https://arxiv.org/abs/1', { fetch: fake }); assert.deepEqual(ok, { ok: true, url: 'https://arxiv.org/abs/1', text: 'paper text' });
  const hop = await scoutFetch('https://arxiv.org/hop', { fetch: fake }); assert.equal(hop.ok, false); assert.match((hop as any).why, /redirected to an address outside/); assert.deepEqual(seen, ['https://arxiv.org/abs/1', 'https://arxiv.org/hop']);
  assert.ok((await audit(5)).some(r => r.agent === 'scout' && r.verb === 'browse' && r.target === 'arxiv.org'));
});

test('risk officer: it halts on each kind of reading past its line, does nothing otherwise, and cannot release', async () => {
  for (const [r, pulls] of [[{ kind: 'drawdown', value: -0.27, limit: -0.25 }, true], [{ kind: 'daily_loss', value: -0.031, limit: -0.03 }, true], [{ kind: 'errors', value: 5, limit: 5 }, true],
    [{ kind: 'drawdown', value: -0.1, limit: -0.25 }, false], [{ kind: 'daily_loss', value: 0.02, limit: -0.03 }, false], [{ kind: 'errors', value: 4, limit: 5 }, false]] as const) {
    const { x, halts } = io(), j = await runJob(riskSpec([r]), x);
    assert.equal(j.stage, 'done', JSON.stringify(r)); assert.equal(halts.length, pulls ? 1 : 0, JSON.stringify(r));
    if (pulls) { assert.equal(halts[0][0], 'risk-officer'); assert.match(halts[0][1], new RegExp(r.kind.replace('_', ' '))); }
  }
  // Several readings past their lines make one halt that names each.
  const { x, halts } = io(); await runJob(riskSpec([{ kind: 'drawdown', value: -0.3, limit: -0.25 }, { kind: 'errors', value: 9, limit: 5 }]), x); assert.equal(halts.length, 1); assert.match(halts[0][1], /drawdown.*; errors 9/);
  // A reading that cannot be read fails the job loudly and halts nothing on a guess.
  const bad = await runJob(riskSpec([{ kind: 'drawdown', value: NaN, limit: -0.25 }]), x); assert.equal(bad.stage, 'failed'); assert.equal(halts.length, 1);
  assert.equal((await runJob(riskSpec([{ kind: 'mood', value: 1, limit: 0 }]), x)).stage, 'failed');
  assert.deepEqual(bookReadings({ equity: 9000, peak: 10000, dayPnl: -200, dayStartEquity: 9200 }, { maxDrawdownPct: 0.08, dailyLossPct: 0.03 }).map(r => [r.kind, +r.value.toFixed(4), r.limit]), [['drawdown', -0.1, -0.08], ['daily_loss', -0.0217, -0.03]]);
  // The halt is on its card and never waits for a yes. Nothing else on the card changes anything outside the outbox.
  assert.ok((await audit(40)).some(r => r.agent === 'risk-officer' && r.verb === 'halt' && r.allow && !r.needsApproval));
  assert.ok((await listJobs()).length <= 100); assert.ok(await getJob(bad.id));
});

test('automations: a switched-off job is skipped, ten failures switch a job off, and only jobs that run here have a switch', async () => {
  let ran = 0, t = Date.UTC(2026, 10, 11); const now = () => (t += 20 * 60e3);
  assert.deepEqual(await scheduled('brief', async () => { ran++; return { ok: 1 }; }, { now }), { ok: 1 }); assert.equal((await states()).brief.lastOk, true);
  await setSwitch('brief', false);
  assert.match((await scheduled('brief', async () => { ran++; return 1; }, { now }) as any).skipped, /switched off/); assert.equal(ran, 1);
  assert.equal(await scheduled('brief', async () => { ran++; return 1; }, { now, byPerson: true }), 1, 'a person can still run it');
  await setSwitch('brief', true);
  for (let i = 0; i < MAX_FAILS; i++) await assert.rejects(scheduled('brief', async () => { throw new Error('host down'); }, { now }));
  const s = (await states()).brief; assert.equal(s.on, false); assert.equal(s.fails, MAX_FAILS); assert.equal(s.lastOk, false); assert.equal(s.lastNote, 'host down');
  assert.equal((await setSwitch('brief', true)).fails, 0);
  // An answer that carries an error counts as a failure.
  await scheduled('deals', async () => ({ error: 'no key' }), { now }); assert.equal((await states()).deals.lastOk, false);
  await assert.rejects(setSwitch('autopilot-full', false), /no switch here/); await assert.rejects(setSwitch('data-health', true), /no switch here/); await assert.rejects(setSwitch('nope', false), /no switch here/);
  // Every job that claims to run here has a route file and a line in vercel.json with the same schedule; planned jobs have neither.
  const crons = JSON.parse(src('vercel.json')).crons as { path: string; schedule: string }[];
  for (const a of AUTOMATIONS.filter(switchable)) { assert.ok(src(`app${a.path}/route.ts`).includes(`scheduled('${a.id}'`), `${a.id} runs under its switch`); assert.deepEqual(crons.find(c => c.path === a.path), { path: a.path, schedule: a.cron }, a.id); }
  assert.equal(crons.length, AUTOMATIONS.filter(switchable).length);
  for (const a of AUTOMATIONS.filter(a => !a.built)) { assert.equal(a.path, undefined); assert.equal(a.cron, undefined); }
  assert.match(src('../.github/workflows/nightly.yml'), new RegExp(`cron: '${AUTOMATIONS.find(a => a.id === 'autopilot-full')!.cron!.replace(/\*/g, '\\*')}'`));
  // Switching on needs the session; switching off does not.
  assert.match(src('app/api/automations/route.ts'), /if \(on && !\(await isAdmin\(\)\)\)/);
  // When a schedule next fires.
  const at = (s: string) => Date.parse(s);
  assert.equal(nextRun('15 23 * * 1-5', at('2026-11-13T23:15:00Z')), at('2026-11-16T23:15:00Z'));   // Friday's run has passed: Monday
  assert.equal(nextRun('45 12 * * *', at('2026-11-11T12:44:30Z')), at('2026-11-11T12:45:00Z'));
  assert.equal(nextRun('0 21 * * 5', at('2026-11-11T00:00:00Z')), at('2026-11-13T21:00:00Z'));
  assert.equal(nextRun('*/30 0 1 * *', at('2026-11-11T00:00:00Z')), at('2026-12-01T00:00:00Z'));
  assert.throws(() => nextRun('61 * * * *', 0)); assert.throws(() => nextRun('* * *', 0));
});
