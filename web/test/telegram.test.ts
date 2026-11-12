// Telegram commands (docs/design/07 s9), run against the real v1 handlers over the demo ledger. What is held here: the reads
// answer from the handlers with each figure's n and basis, /halt halts only on a fresh second tap and only once, a claim
// check is refused when the week's tries are used, and nothing in Telegram resumes, releases or approves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, type LedgerEntry } from '@apex/kernel';
import { buildView } from '@apex/kernel/view';
import { statusFrom } from '../lib/status';
import { direct, type ServeDeps } from '../lib/api/serve';
import { COMMANDS, DASHBOARD_ONLY, HALT_WINDOW_MS, HELP, callback, command, type Io } from '../lib/tgcommands';

const web = resolve(__dirname, '..'), ORIGIN = 'https://apex.test';
const ENTRIES: LedgerEntry[] = readFileSync(join(web, '../apps/cli/fixtures/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
function rig(o: { ledger?: boolean; used?: number } = {}) {
  let t = (ENTRIES[ENTRIES.length - 1].ts ?? 0) + 3600e3; const cfg = loadConfig({}, 'cli'), halts: [string, string][] = [], checks: any[] = [], store = new Map<string, { reason: string; ts: number }>();
  const entries = o.ledger === false ? [] : ENTRIES;
  const deps: ServeDeps = { key: async () => null, session: async () => false, count: async () => ({ n: 1, resetSec: 60 }), now: () => t,
    status: async () => statusFrom({ ledger: o.ledger === false ? 'none' : 'file', entries, capital: cfg.paperCapital, cord: { on: halts.length > 0, by: halts[0]?.[0], reason: halts[0]?.[1] }, killswitch: false, persistent: true, signedIn: false, authEnabled: true, aiEnabled: false, now: t }),
    ledger: async () => o.ledger === false ? { ok: false, note: 'no ledger is connected' } : { ok: true, entries, view: buildView(entries, cfg.paperCapital), cfg },
    readReport: async () => null, remember: { get: async () => null, set: async () => {} },
    claimCheck: async (req: any) => { if (!req.run) return { ok: true, step: 'plan', extraction: { ruleSets: [] }, extractionErrors: [] } as any; checks.push(req);
      return { ok: true, step: 'run', seq: 99, result: { id: 'c9', status: 'done', verdict: 'no_edge', headline: 'No edge was found in the rules as stated.', tries: { fresh: 1 } } } as any; },
    halt: async (by, reason) => { const already = halts.length > 0; halts.push([by, reason]); return { already, ledger: o.ledger === false ? 'no_ledger' : 'recorded' }; } };
  const call = direct(deps, 'telegram');
  const io: Io = { call: (async (id: any, a: any) => { if (id === 'queue' && o.used !== undefined) { const q = await call('queue'); return { ...q, used: o.used }; } return call(id, a); }) as Io['call'], origin: ORIGIN, now: () => t,
    pending: { get: async k => store.get(k) ?? null, set: async (k, v) => { if (v) store.set(k, v); else store.delete(k); } }, legacy: async c => c === '/state' ? 'Bots: 0 on.' : c.startsWith('/bots') ? 'no bots' : null };
  return { io, halts, checks, store, tick: (ms: number) => { t += ms; } };
}

test('reads: each command answers from the handlers, says it is paper and past data, and links to its screen', async () => {
  const { io, halts, checks } = rig();
  const state = (await command('/state', io)).text; assert.match(state, /^PAPER · \d+ tries counted/); assert.match(state, /Pairs: \d+ tried/); assert.match(state, /Bots: 0 on\./);
  const board = (await command('/board@ApexBot', io)).text; assert.match(board, /Never by return/); assert.match(board, /1\. \S+ \S+ \S+: [a-z ]+, \d\/7 checks, Sharpe -?[\d.]+ \(past data, after costs, n=\d+\)/); assert.match(board, /Past data is not a forward record/);
  assert.ok(board.split('\n').filter(l => /^\d+\. /.test(l)).length <= 10);
  assert.match((await command('/report', io)).text, /^Run \S+ \(\w+\) at .*\n.*new tries \d+.*\n[\s\S]*https:\/\/apex\.test\/autopilot\/reports\//);
  assert.match((await command('/slots', io)).text, /forward trades[\s\S]*It is not proven\./);
  assert.match((await command('/book', io)).text, /^BOOK \(paper book[\s\S]*No real money is in this book/);
  const risk = (await command('/risk', io)).text; assert.match(risk, /riskPct: [\d.]+% \([\d.]+%\)/); assert.match(risk, /cannot be changed from here/);
  assert.match((await command('/data', io)).text, /^\d+ of \d+ datasets are ok\./); assert.match((await command('/queue', io)).text, /^Tries this week: \d+ of 25/);
  assert.equal((await command('/help', io)).text, HELP); for (const c of COMMANDS) assert.ok(HELP.includes(c), `help lists ${c}`);
  assert.equal((await command('/bots', io)).text, 'no bots', 'the older bot commands still answer'); assert.equal((await command('/nonsense', io)).text, HELP);
  assert.deepEqual([halts, checks], [[], []], 'no read changed anything');
});

test('with no ledger: state says the tries are unknown, and a read says the ledger is not readable', async () => {
  const { io } = rig({ ledger: false });
  assert.match((await command('/state', io)).text, /tries unknown \(no ledger\)[\s\S]*unknown, not zero/);
  assert.match((await command('/board', io)).text, /^Apex said no \(unavailable\): The ledger is not readable/);
});

test('/halt: nothing is halted by the command. A fresh second tap halts once; a late, repeated, cancelled or forged tap does not', async () => {
  const a = rig(), offer = await command('/halt the fills look wrong', a.io);
  assert.match(offer.text, /Nothing is halted yet/); assert.deepEqual(offer.buttons!.map(b => b.text), ['Halt now', 'Cancel']); assert.deepEqual(a.halts, []);
  const data = offer.buttons![0].data; assert.match(data, /^halt:[0-9a-f]{16}$/);
  const done = await callback(data, a.io); assert.match(done.text, /^Halted\. Every bot is told to pause\. The halt is in the ledger\.\nReason: the fills look wrong\nResuming needs the dashboard/); assert.deepEqual(a.halts, [['telegram', 'the fills look wrong']]);
  assert.match((await callback(data, a.io)).text, /offer has ended, so nothing was halted/); assert.equal(a.halts.length, 1, 'the same tap twice halts once');

  const late = rig(), o2 = await command('/halt', late.io); late.tick(HALT_WINDOW_MS + 1);
  assert.match((await callback(o2.buttons![0].data, late.io)).text, /offer has ended/); assert.deepEqual(late.halts, []); assert.equal(late.store.size, 0);

  const c = rig(), o3 = await command('/halt x', c.io); assert.match((await callback(o3.buttons![1].data, c.io)).text, /Cancelled\. Nothing was halted/);
  assert.match((await callback(o3.buttons![0].data, c.io)).text, /offer has ended/); assert.deepEqual(c.halts, []);
  for (const forged of ['halt:0000000000000000', 'halt:', 'halt:../../x', 'resume:abc', 'release:0000000000000000', '']) { const r = await callback(forged, c.io); assert.doesNotMatch(r.text, /^Halted/); } assert.deepEqual(c.halts, []);

  const n = rig({ ledger: false }), o4 = await command('/halt no ledger here', n.io); assert.match((await callback(o4.buttons![0].data, n.io)).text, /^Halted\.[\s\S]*No ledger is connected here, so also run apex halt/); assert.equal(n.halts.length, 1, 'a halt never waits on a ledger');
});

test('/check: needs real text, is refused when the week is used up, and otherwise runs one counted check', async () => {
  const text = 'Buy when the 50 day average crosses above the 200 day average and sell when it crosses back below.';
  const a = rig(); assert.match((await command('/check too short', a.io)).text, /^Send the text to check/); assert.equal(a.checks.length, 0);
  const full = rig({ used: 25 }); assert.match((await command(`/check ${text}`, full.io)).text, /tries are used up \(25 of 25\)\. Nothing was run/); assert.deepEqual(full.checks, []);
  const ok = await command(`/check ${text}`, a.io); assert.equal(a.checks.length, 1); assert.equal(a.checks[0].text, text);
  assert.match(ok.text, /^No edge was found[\s\S]*Verdict: no edge\. Tries used by this check: 1\.[\s\S]*not about the author[\s\S]*https:\/\/apex\.test\/claims\/c9$/);
  const file = await command('/check', a.io, `${text} From a file.`); assert.equal(a.checks.length, 2); assert.match(file.text, /Verdict: no edge/);
});

test('Telegram never resumes, releases, approves or changes a limit', async () => {
  const { io, halts, checks, store } = rig();
  for (const c of Object.keys(DASHBOARD_ONLY)) { const r = await command(`${c} now please`, io); assert.match(r.text, /^That needs the dashboard, signed in: https:\/\/apex\.test\//, c); assert.equal(r.buttons, undefined); }
  assert.deepEqual([halts, checks, store.size], [[], [], 0]);
  for (const must of ['/resume', '/release', '/approve', '/live', '/limit']) assert.ok(must in DASHBOARD_ONLY, must);
  const lib = readFileSync(join(web, 'lib/tgcommands.ts'), 'utf8'), route = readFileSync(join(web, 'app/api/telegram/route.ts'), 'utf8');
  // The only writes Telegram can reach are the two the API has, and the route no longer imports the cord at all.
  assert.deepEqual([...lib.matchAll(/call\('(\w+)'/g)].map(m => m[1]).filter(id => !['status', 'funnel', 'reports', 'board', 'slots', 'book', 'risk', 'dataHealth', 'queue'].includes(id)).sort(), ['claimCheckStart', 'halt']);
  assert.doesNotMatch(lib + route, /releaseCord|pullCord|@\/lib\/andon|\/api\/resume|killswitch|ledgerResume/);
  assert.match(route, /req\.headers\.get\('x-telegram-bot-api-secret-token'\) !== want\) return new Response\('forbidden', \{ status: 403 \}\)/);
  assert.match(route, /if \(String\(q\.message\?\.chat\?\.id\) !== CHAT\) return Response\.json\(\{ ok: true \}\);\n    const r = await callback/, 'a tap from any other chat is ignored before it is looked at');
});

test('webhook: wrong secret is refused, another chat is ignored, and the halt button works end to end through the real route', async () => {
  const { mkdtempSync } = await import('node:fs'), { tmpdir } = await import('node:os');
  const secret = ['hook', 'check', Date.now()].join('-'), CHAT = '4242';
  Object.assign(process.env, { TELEGRAM_WEBHOOK_SECRET: secret, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_BOT_TOKEN: ['bot', 'for', 'tests'].join('-'), APEX_STATE_DIR: mkdtempSync(join(tmpdir(), 'apex-tg-')) });
  const sent: { method: string; body: any }[] = [], realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => { const u = String(url); if (!u.startsWith('https://api.telegram.org/')) throw new Error(`unexpected call to ${u}`); sent.push({ method: u.split('/').pop()!, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, result: {} })); }) as typeof fetch;
  try {
    const { POST } = await import('../app/api/telegram/route');
    const hit = (update: object, s = secret) => POST(new Request('https://apex.test/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s }, body: JSON.stringify(update) }));
    assert.equal((await hit({ message: { text: '/halt x', chat: { id: CHAT } } }, 'wrong')).status, 403);
    await hit({ message: { text: '/halt x', chat: { id: 999 } } }); await hit({ callback_query: { id: 'q0', data: 'halt:0000000000000000', message: { message_id: 1, chat: { id: 999 } } } });
    assert.equal(sent.length, 0, 'nothing is said to, or done for, another chat');

    await hit({ message: { text: '/release', chat: { id: CHAT } } }); assert.match(sent.pop()!.body.text, /^That needs the dashboard/);
    await hit({ message: { text: '/halt data looks wrong', chat: { id: CHAT } } });
    const offer = sent.pop()!; assert.equal(offer.method, 'sendMessage'); const [yes] = offer.body.reply_markup.inline_keyboard[0]; assert.equal(yes.text, 'Halt now');
    const { cord } = await import('../lib/andon'); assert.equal((await cord()).on, false, 'the command alone halts nothing');
    await hit({ callback_query: { id: 'q1', data: yes.callback_data, message: { message_id: 7, chat: { id: CHAT } } } });
    const edit = sent.find(x => x.method === 'editMessageText')!; assert.ok(sent.some(x => x.method === 'answerCallbackQuery')); assert.match(edit.body.text, /^Halted\. Every bot is told to pause\./); assert.equal(edit.body.message_id, 7);
    const c = await cord(); assert.equal(c.on, true); assert.equal(c.reason, 'data looks wrong');
  } finally { globalThis.fetch = realFetch; }
});
