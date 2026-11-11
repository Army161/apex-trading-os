// The read side of the terminal (docs/design/08 s7): every command's text and JSON against the committed fixture ledger,
// remote mode through the client with a pretend dashboard, the exit codes, the command registry and the full-screen view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROUTES, matchRoute, validate, type RouteDef } from '@apex/sdk';
import { COMMANDS, GLOBAL_FLAGS, main } from '../src/main';
import { makeCtx, type Ctx } from '../src/runtime';
import { FIXTURE_LEDGER, SourceError, localSource } from '../src/source';
import { START, frame, load, press, PANES, type TuiState } from '../src/tui';
import { fixtureText } from '../fixtures/make';

const ROOT = resolve(__dirname, '../../..'), SLOT = 'demo_alpha@csv:SPY:1h:split', NOW = Date.UTC(2026, 10, 11, 12);
const fresh = (env: Record<string, string> = {}, fetchFn?: typeof fetch): Ctx => ({ ...makeCtx(ROOT, { APEX_STATE_DIR: mkdtempSync(join(tmpdir(), 'apex-term-')), ...env }, () => NOW), fetch: fetchFn });
const run = async (ctx: Ctx, ...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };

// What a person would type, in the order of the help text. Each runs twice: as text, and with --json.
const READS = ['status', 'board', 'board --sort sharpe --top 2', 'board --status watch', 'pair demo_alpha csv:SPY:1h:split', 'slots', `slot ${SLOT}`, `slot ${SLOT} --trades`, `slot ${SLOT} --intents`, `slot ${SLOT} --events`, `slot ${SLOT} --drift`,
  'book', 'book --positions', 'book --fills', 'book --trades', 'book --blocked', 'risk', 'queue', 'costs', 'data health', 'report --list', 'report', 'ledger head', 'ledger tail -n 5', 'ledger show 5', 'ledger verify', 'live status', `live status ${SLOT}`];
const ONCE = ['tui --once --cols 110 --rows 26', 'tui --once --cols 72 --rows 20', 'completion bash', 'completion zsh', 'completion fish', 'help'];

test('the committed fixture ledger is the one its script makes', () => assert.equal(readFileSync(FIXTURE_LEDGER, 'utf8'), fixtureText(), 'run: npx tsx apps/cli/fixtures/make.ts'));

test('snapshots: every read command as text and as JSON, on the fixtures', async () => {
  const ctx = fresh(), human: string[] = [], machine: string[] = [];
  for (const c of [...READS, ...ONCE]) { const r = await run(ctx, ...c.split(' '), '--fixtures'); assert.equal(r.code, 0, `${c}: ${r.text}`); human.push(`$ apex ${c} --fixtures`, r.text, ''); }
  for (const c of READS) { const r = await run(ctx, ...c.split(' '), '--fixtures', '--json'); assert.equal(r.code, 0, c); assert.doesNotThrow(() => JSON.parse(r.text), `${c} --json prints one JSON document`); machine.push(`$ apex ${c} --fixtures --json`, r.text, ''); }
  assert.ok(!existsSync(join(ctx.stateDir, 'ledger.jsonl')), 'reading the fixtures writes nothing');
  for (const [name, got] of [['human.txt', human.join('\n')], ['json.txt', machine.join('\n')]] as const) { const p = join(__dirname, 'snapshots', name);
    if (process.env.UPDATE_SNAPSHOTS) { mkdirSync(join(__dirname, 'snapshots'), { recursive: true }); writeFileSync(p, got); }
    assert.equal(got, readFileSync(p, 'utf8'), `${name} changed. If the change is meant, run the tests once with UPDATE_SNAPSHOTS=1 and commit the file.`); }
});

test('the book commands open with PAPER and the count of tries, and performance tables say n, basis and net', async () => {
  const ctx = fresh();
  for (const c of ['status', 'board', 'pair demo_alpha csv:SPY:1h:split', 'slots', `slot ${SLOT}`, 'book', 'book --trades', 'risk', 'queue']) assert.match((await run(ctx, ...c.split(' '), '--fixtures')).text, /^PAPER · 3 tries counted · /, c);
  const board = (await run(ctx, 'board', '--fixtures')).text.split('\n').find(l => l.startsWith('strategy'))!; for (const col of [' n ', 'basis', 'net']) assert.ok(board.includes(col), `the board has a ${col.trim()} column`);
  const trades = (await run(ctx, 'book', '--trades', '--fixtures')).text; assert.match(trades, /basis\s+net/); assert.match((await run(ctx, 'book', '--fixtures')).text, /BOOK \(paper book, after costs, n=1\)/);
  assert.match((await run(ctx, 'board', '--fixtures')).text, /Never by return/); assert.equal((await run(ctx, 'board', '--sort', 'return', '--fixtures')).code, 2, 'the board cannot be sorted by return');
});

test('--json prints the shape the API promises', async () => {
  const ctx = fresh(), json = async (...c: string[]) => JSON.parse((await run(ctx, ...c, '--fixtures', '--json')).text);
  const shapes: [string[], string][] = [[['status'], 'Status'], [['board'], 'EvaluationPage'], [['pair', 'demo_alpha', 'csv:SPY:1h:split'], 'EvaluationDetail'], [['slots'], 'SlotPage'], [['slot', SLOT], 'SlotDetail'], [['slot', SLOT, '--trades'], 'TradePage'],
    [['book'], 'Book'], [['book', '--positions'], 'PositionPage'], [['book', '--fills'], 'FillPage'], [['book', '--blocked'], 'IntentPage'], [['risk'], 'Risk'], [['queue'], 'Queue'], [['costs'], 'Costs'], [['data', 'health'], 'DataHealthPage'],
    [['report', '--list'], 'ReportRowPage'], [['report'], 'Report'], [['ledger', 'head'], 'LedgerHead'], [['ledger', 'tail'], 'LedgerRowPage'], [['ledger', 'show', '5'], 'LedgerEntry'], [['ledger', 'verify'], 'LedgerVerify']];
  for (const [c, schema] of shapes) assert.deepEqual(validate(schema, await json(...c)), [], `${c.join(' ')} is a ${schema}`);
});

test('exit codes: 0 ok, 1 error, 2 usage, 3 halted or blocked, 4 verification failed', async () => {
  const ctx = fresh();
  assert.equal((await run(ctx, 'ledger', 'verify')).code, 0, 'an empty ledger verifies');
  assert.equal((await run(ctx, 'pair', 'nobody', 'nowhere', '--fixtures')).code, 1); assert.equal((await run(ctx, 'slot', 'no-such-slot', '--fixtures')).code, 1); assert.equal((await run(ctx, 'ledger', 'show', '999', '--fixtures')).code, 1);
  for (const c of [['slot'], ['pair'], ['ledger', 'show', 'x'], ['ledger', 'nonsense'], ['board', '--top', '0'], ['queue', 'approve', '1'], ['live', 'sign', SLOT], ['completion', 'powershell'], ['status', '--remote'], ['halt', 'why', '--fixtures'], ['run', '--fixtures'], ['doctor', '--remote'], ['resume']])
    assert.equal((await run(ctx, ...c)).code, 2, c.join(' '));
  // A ledger someone edited: one payload changed after it was written.
  const lines = fixtureText().trim().split('\n'), bad = JSON.parse(lines[11]); bad.payload.weights = { [SLOT]: 1 }; lines[11] = JSON.stringify(bad);
  writeFileSync(join(ctx.stateDir, 'ledger.jsonl'), lines.join('\n') + '\n');
  const v = await run(ctx, 'ledger', 'verify'); assert.equal(v.code, 4); assert.match(v.text, /BROKEN at #12: payload was changed after it was written/);
  const vj = await run(ctx, 'ledger', 'verify', '--json'); assert.equal(vj.code, 4); assert.deepEqual([JSON.parse(vj.text).ok, JSON.parse(vj.text).badSeq], [false, 12]);
  assert.equal((await run(ctx, 'ledger', 'replay')).code, 4); assert.equal((await run(ctx, 'doctor')).code, 4, 'doctor fails verification on a broken chain');
  assert.equal((await run(ctx, 'ledger', 'verify', '--from', '13')).code, 4, 'a damaged file is refused whole, wherever the check starts');
  const st = await run(ctx, 'status'); assert.equal(st.code, 1); assert.match(st.text, /ledger file is damaged at seq 12/);
});

// A pretend dashboard: the fixture ledger behind the contract's own paths, with one key.
function dashboard(o: { key: string; refuse?: (id: string) => { status: number; code: string; detail: string; retry?: number } | null }) {
  const src = localSource(fresh(), { fixtures: true }), seen: { method: string; path: string; auth: string | null; body: unknown }[] = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => { const u = new URL(String(url)), method = init.method ?? 'GET', auth = new Headers(init.headers).get('authorization'), body = init.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ method, path: u.pathname, auth, body });
    const problem = (status: number, code: string, detail: string, retry?: number) => new Response(JSON.stringify({ type: 'about:blank', title: code, status, detail, code }), { status, headers: { 'content-type': 'application/problem+json', ...(retry ? { 'retry-after': String(retry) } : {}) } });
    if (auth !== `Bearer ${o.key}`) return problem(401, 'unauthorized', 'The key is missing or wrong.');
    const m = matchRoute(method, u.pathname.replace(/^\/api\/v1/, '')); if (!m) return problem(404, 'not_found', 'No such route.');
    const no = o.refuse?.(m.id); if (no) return problem(no.status, no.code, no.detail, no.retry);
    if (m.id === 'halt') return Response.json({ halted: true, already: false, ledger: 'recorded' });
    if (m.id === 'claimCheckStart') return Response.json({ id: 'chk_demo', status: 'done', verdict: 'no_edge', headline: 'No edge found in 1 reading.', trialsUsed: 1, receipt: 23, repeated: false }, { status: 202 });
    try { const r = await src.call(m.id, { params: m.params, query: Object.fromEntries(u.searchParams) }); return Response.json(r, { status: (ROUTES[m.id] as RouteDef).status ?? 200 }); }
    catch (e) { const s = e as SourceError; return problem(s.code === 'not_found' ? 404 : 422, s.code, s.message); }
  }) as typeof fetch;
  return { f, seen };
}

test('remote mode reads, halts and queues a claim through the API, and never prints the key', async () => {
  const key = ['apx', 'k1', 'x'.repeat(24)].join('_'), d = dashboard({ key }), ctx = fresh({ APEX_API_URL: 'https://apex.example', APEX_API_KEY: key }, d.f), all: string[] = [];
  const local = fresh();
  for (const c of ['status', 'board', 'pair demo_alpha csv:SPY:1h:split', `slot ${SLOT}`, 'book --trades', 'risk', 'queue', 'ledger tail -n 5', 'ledger verify', 'live status', 'report --list']) {
    const r = await run(ctx, ...c.split(' ')); assert.equal(r.code, 0, `${c}: ${r.text}`); all.push(r.text);
    assert.equal(r.text, (await run(local, ...c.split(' '), '--fixtures')).text, `${c} reads the same from the API as from the ledger`); }
  assert.ok(d.seen.length > 15 && d.seen.every(s => s.auth === `Bearer ${key}` && s.path.startsWith('/api/v1/')));
  const h = await run(ctx, 'halt', 'testing', 'remote'); assert.equal(h.code, 0); assert.match(h.text, /Andon cord pulled on the dashboard/); assert.deepEqual(d.seen[d.seen.length - 1], { method: 'POST', path: '/api/v1/halt', auth: `Bearer ${key}`, body: { reason: 'testing remote' } }); all.push(h.text);
  const c = await run(ctx, 'claim', 'archive/chat/03-turtle-breakout-ai-trading-bot-tradingview.md', '--extraction', 'packages/claims/test/fixtures/turtle.extraction.json'); assert.equal(c.code, 0, c.text); assert.match(c.text, /No edge found in 1 reading\.\nVerdict: no_edge\. Tries used by this check: 1\./); all.push(c.text);
  const sent = d.seen[d.seen.length - 1]; assert.equal(sent.path, '/api/v1/claim-checks'); assert.deepEqual(Object.keys(sent.body as object).sort(), ['extraction', 'kind', 'text']);
  assert.ok(!existsSync(join(ctx.stateDir, 'ledger.jsonl')), 'remote mode writes nothing here');
  // Commands that need the checkout say so, and --local reads the checkout even with the API settings present.
  for (const x of [['run', '--remote'], ['validate', '--remote'], ['strategies', 'list', '--remote'], ['signoff', 'x', '--reason', 'y', '--remote'], ['data', 'pull', '--remote'], ['ledger', 'replay', '--remote']]) assert.equal((await run(ctx, ...x)).code, 2, x.join(' '));
  const before = d.seen.length; assert.match((await run(ctx, 'status', '--local')).text, /^PAPER · 0 tries counted/); assert.equal(d.seen.length, before);
  assert.ok(!all.join('\n').includes(key) && !all.join('\n').includes('x'.repeat(24)), 'the key is in no output');
});

test('remote mode: refusals become plain words and the right exit code, with no key and no request in them', async () => {
  const key = ['apx', 'k2', 'y'.repeat(24)].join('_'), env = { APEX_API_URL: 'https://apex.example', APEX_API_KEY: key };
  const wrong = await run(fresh({ ...env, APEX_API_KEY: 'apx_k2_wrong' }, dashboard({ key }).f), 'status'); assert.equal(wrong.code, 1); assert.match(wrong.text, /^apex: unauthorized: The key is missing or wrong\.$/);
  const refuse = (id: string) => id === 'claimCheckStart' ? { status: 409, code: 'halted', detail: 'The andon cord is pulled.' } : id === 'board' ? { status: 429, code: 'rate_limited', detail: 'Too many requests.', retry: 30 } : id === 'slot' ? { status: 403, code: 'forbidden_scope', detail: 'This key lacks read:slots.' } : null;
  const ctx = fresh(env, dashboard({ key, refuse }).f);
  const claim = await run(ctx, 'claim', 'archive/chat/03-turtle-breakout-ai-trading-bot-tradingview.md'); assert.equal(claim.code, 3); assert.match(claim.text, /The andon cord is pulled/);
  const board = await run(ctx, 'board'); assert.equal(board.code, 1); assert.match(board.text, /Try again in 30 seconds/);
  const slot = await run(ctx, 'slot', SLOT, '--json'); assert.equal(slot.code, 1); assert.equal(JSON.parse(slot.text).code, 'forbidden_scope');
  const down = await run(fresh(env, (async () => { throw new TypeError(`fetch failed for https://apex.example with ${key}`); }) as unknown as typeof fetch), 'status'); assert.equal(down.code, 1); assert.ok(!down.text.includes(key)); assert.match(down.text, /could not be reached/);
  assert.match((await run(fresh({ APEX_API_URL: 'http://apex.example', APEX_API_KEY: key }), 'status')).text, /must be https/, 'the key is never sent in the clear');
  assert.match((await run(fresh(), 'status', '--remote')).text, /needs APEX_API_URL and APEX_API_KEY/);
});

test('the command registry: it matches the code, names what writes, and has nothing that trades, resumes or goes live', () => {
  const src = readFileSync(join(__dirname, '../src/main.ts'), 'utf8'), body = src.slice(src.indexOf('async function dispatch'));
  const cases = body.split('\n').filter(l => /^    case /.test(l)).flatMap(l => [...l.matchAll(/case '([\w-]+)':/g)].map(x => x[1])).filter(c => c !== '--help');
  assert.deepEqual([...new Set(cases)].sort(), Object.keys(COMMANDS).sort(), 'every command in the switch is in the registry, and the other way round');
  assert.deepEqual(Object.keys(COMMANDS).filter(c => COMMANDS[c].writes).sort(), ['claim', 'data', 'halt', 'mcp', 'run', 'signoff', 'strategies', 'validate'], 'the commands that can write anything at all');
  const words = [...Object.keys(COMMANDS), ...Object.values(COMMANDS).flatMap(c => [...(c.subs ?? []), ...(c.flags ?? [])]), ...GLOBAL_FLAGS];
  for (const w of words) assert.doesNotMatch(w, /^(order|buy|sell|trade|withdraw|pay|transfer|resume|approve|sign|go-?live|key|token|secret|password)$/i, w);
  assert.doesNotMatch(src, /autopilot\/(src\/)?broker|ledgerResume|releaseCord/, 'the terminal imports nothing that trades or resumes');
  assert.doesNotMatch(src, /(?<!!!ctx\.)env\.APEX_API_KEY/, 'the command file only asks whether a key is set. Its value is read in source.ts, by the client');
  for (const c of Object.values(COMMANDS)) for (const f of [...(c.flags ?? []), ...GLOBAL_FLAGS]) assert.ok(new RegExp(`--${f}\\b|-${f}\\b|'${f}'`).test(src), `--${f} is handled`);
});

test('completion covers every command for bash, zsh and fish, and completes names only', async () => {
  const ctx = fresh();
  for (const sh of ['bash', 'zsh', 'fish']) { const t = (await run(ctx, 'completion', sh)).text; for (const c of Object.keys(COMMANDS)) assert.ok(t.includes(c), `${sh}: ${c}`); assert.ok(t.includes('verify') && t.includes('fixtures')); assert.doesNotMatch(t, /APEX_|apx_/); }
});

test('the full-screen view: a pure frame of the right size, keys that only read, and a halt that needs a reason and the word', async () => {
  const src = localSource(fresh(), { fixtures: true }), d = await load(src);
  for (const [cols, rows] of [[110, 26], [72, 20], [40, 12]]) for (let p = 0; p < PANES.length; p++) { const f = frame(d, { ...START, pane: p }, cols, rows).split('\n'); assert.equal(f.length, rows, `${PANES[p]} at ${cols}x${rows}`); assert.ok(f.every(l => [...l].length === cols), `${PANES[p]} lines are ${cols} wide`); }
  assert.match(frame(d, START, 110, 26), /APEX ─ PAPER ─ 3 tries counted ─ data ok ─ no halts/);
  const keys = (st: TuiState, ...ks: string[]) => { const acts: unknown[] = []; for (const k of ks) { const r = press(st, k, d); st = r.state; if (r.action) acts.push(r.action); } return { st, acts }; };
  const board = keys(START, '2', 'down', 'enter'); assert.deepEqual(board.acts, [{ do: 'open', pane: 1, id: 'b'.repeat(64) }]); assert.match(frame(d, board.st, 110, 26), /> demo_beta/);
  const filtered = keys(START, '2', '/', 'g', 'a', 'm', 'enter'); assert.equal(filtered.st.filter, 'gam'); assert.match(frame(d, filtered.st, 110, 26), /Filter: gam   \(1 of 3 rows\)/); assert.deepEqual(keys(filtered.st, 'enter').acts, [{ do: 'open', pane: 1, id: 'c'.repeat(64) }]);
  assert.deepEqual(keys(START, 'r').acts, [{ do: 'refresh' }]); assert.deepEqual(keys(START, '?', 'q').acts, [{ do: 'quit' }]); assert.equal(keys(START, '9').st.pane, 0, 'there is no ninth pane');
  // Halt: H, a reason, Enter, then the exact word. Anything else leaves the cord alone.
  const type = (s: string) => s.split('');
  assert.deepEqual(keys(START, 'H', ...type('bad fill'), 'enter', ...type('HALT'), 'enter').acts, [{ do: 'halt', reason: 'bad fill' }]);
  for (const ks of [['H', 'enter'], ['H', ...type('x'), 'enter', 'enter'], ['H', ...type('x'), 'enter', ...type('halt'), 'enter'], ['H', ...type('x'), 'enter', ...type('HALT'), 'esc'], ['H', ...type('x'), 'esc'], ['h'], ['R'], ['y']]) assert.deepEqual(keys(START, ...ks).acts, [], ks.join(''));
  assert.match(frame(d, keys(START, 'H', ...type('bad fill'), 'enter').st, 110, 26), /Pull the cord for "bad fill"\? Type HALT and Enter/);
  const acts = new Set<string>(); for (const st of [START, { ...START, mode: 'detail' as const }, { ...START, mode: 'help' as const }]) for (let c = 32; c < 127; c++) { const a = press(st, String.fromCharCode(c), d).action; if (a) acts.add(a.do); }
  assert.deepEqual([...acts].sort(), ['quit', 'refresh'], 'no single key changes anything');
});
