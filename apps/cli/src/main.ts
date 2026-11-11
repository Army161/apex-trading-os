#!/usr/bin/env -S npx tsx
// apex: the command line (docs/design/08). A read command asks a Source (this checkout's ledger, the dashboard's API, or the
// committed fixtures) and prints the API's own shapes, as text or with --json. `run`, `validate`, `claim` and `halt` are the
// only commands that write to the ledger, and they write only ledger entries. There is no order command, no resume command
// and no way to go live from here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { STRATEGIES } from '@apex/engine/strategies';
import { GATE_V1, Ledger, STAGES, buildView, gateVersion, loadConfig, passBar, verifyChain } from '@apex/kernel';
import { checkHeads, planAnchor, readHeads, writeHead } from './anchor';
import { PRIOR_COSTS } from '@apex/autopilot';
import { EXTRACT_FAILED, extractionRequest, intake, validateExtraction, type Extracted } from '@apex/claims';
import type { ClaimCheckBody, DataHealth, DriftReading, Evaluation, Fill, HaltResult, Intent, LedgerRow, LedgerVerify, Locks, Position, ReportRow, Slot, SlotEvent, Trade } from '@apex/sdk';
import { claimCheck, execute, makeSignoff, terminalConfirm, fingerprints, loadData, makeCtx, openStore, pullData, sendTelegram, type Ctx } from './runtime';
import { SourceError, all, localSource, remoteSource, type Source } from './source';
import * as R from '@apex/sdk/text';
import { completion } from './completion';
import { runTui } from './tui';

/** Every command there is. The shell completion is made from this, and a test holds it against the switch below, so a command
 *  cannot be added without being listed here with what it writes. `local` means it works only on this checkout's own ledger. */
export type Command = { about: string; subs?: string[]; flags?: string[]; writes?: string; local?: boolean };
export const COMMANDS: Record<string, Command> = {
  status: { about: 'Mode, halts, last run, slots, book' },
  run: { about: 'Run the pipeline once', flags: ['full', 'budget', 'dry-run', 'seed', 'seed-if-empty', 'send'], writes: 'ledger entries and a report', local: true },
  validate: { about: 'Independent re-run of anything waiting for the validator', flags: ['level', 'dry-run'], writes: 'ledger entries', local: true },
  board: { about: 'Every evaluated pair', flags: ['status', 'market', 'tf', 'q', 'top', 'sort'] },
  pair: { about: 'One evaluation in detail' },
  slots: { about: 'Every slot ever locked' },
  slot: { about: 'One slot: clock, forward record, locks', flags: ['trades', 'intents', 'events', 'drift'] },
  book: { about: 'The paper book', flags: ['positions', 'fills', 'trades', 'blocked'] },
  risk: { about: 'Limits, halts, exposure, drift' },
  queue: { about: 'The weekly budget of tries', subs: ['list'] },
  costs: { about: 'The cost model in force' },
  report: { about: 'A run report', flags: ['list', 'id', 'date', 'send'] },
  data: { about: 'Data health, or pull new bars', subs: ['health', 'pull'], writes: 'refreshed bars in the state folder (pull only)' },
  ledger: { about: 'Read and verify the ledger', subs: ['head', 'tail', 'show', 'verify', 'replay', 'anchor'], flags: ['n', 'kind', 'slot', 'from'] },
  strategies: { about: 'The strategy library and its fingerprints', subs: ['list', 'show', 'fingerprint'], flags: ['write', 'check'], writes: 'the fingerprint file (--write only)', local: true },
  claim: { about: 'Test the rules a source states', flags: ['extraction', 'kind', 'dry-run', 'request', 'wait'], writes: 'ledger entries' },
  halt: { about: 'Pull the andon cord', writes: 'one halt entry' },
  signoff: { about: 'Jeremy only: allow one edit of a red path', flags: ['reason'], writes: 'one sign-off file', local: true },
  live: { about: 'The four locks, read-only', subs: ['status'] },
  doctor: { about: 'Config, ledger chain, data, fingerprints', local: true },
  tui: { about: 'Full-screen view', flags: ['once'] },
  mcp: { about: 'Serve the MCP tools over stdio, for Claude Code and Claude Desktop', writes: 'a halt entry or a claim check, only when a client calls those two tools' },
  completion: { about: 'Print a shell completion script', subs: ['bash', 'zsh', 'fish'] },
  help: { about: 'This text' },
};
export const GLOBAL_FLAGS = ['json', 'remote', 'local', 'fixtures'];

const HELP = `apex: paper-first trading research. Nothing here places a live order.

  apex status                          Mode, halts, last run, slots, book
  apex run [--full | --budget N] [--dry-run] [--seed plan:<id>] [--send telegram]
                                       Run the pipeline once. --dry-run writes nothing
  apex validate [--level L1|L2]        Independent re-run of anything waiting for the validator
  apex board [--status S] [--market M] [--tf T] [--q text] [--top N] [--sort checks|sharpe]
  apex pair <strategy> <dataset>       One evaluation in detail (or: apex pair <trial key>)
  apex slots                           Every slot ever locked
  apex slot <key> [--trades | --intents | --events | --drift]
  apex book [--positions | --fills | --trades | --blocked]
  apex risk | queue | costs
  apex report [--list] [--id <run>] [--date YYYY-MM-DD] [--send telegram]
  apex data health | pull              pull needs MASSIVE_API_KEY (a data key; it cannot trade)
  apex ledger head | tail [-n N] [--kind K] [--slot S] | show <seq> | verify [--from N] | replay | anchor
  apex strategies list | show <id> | fingerprint [--write | --check]
  apex claim <file | -> --extraction <json> [--kind transcript|pine|page|rules] [--dry-run]
                                       Test the rules a source states. Each reading is one try
  apex claim <file> --request          Print the extraction request (prompt and schema). No model is called here
  apex halt "<reason>"                 Pull the andon cord. Always allowed
  apex signoff <path> --reason "..."   Jeremy only: allow one edit of a red path for 48 hours. Needs APEX_SIGNOFF_KEY and a keyboard
  apex live status [slot]              The four locks, read-only
  apex doctor                          Config, ledger chain, data, fingerprints
  apex tui                             Full-screen view. Read-only except for Halt
  apex mcp                             Serve the MCP tools over stdio (for Claude Code and Claude Desktop). Read, claim check and halt only
  apex completion bash|zsh|fish        Print a completion script

Where the answer comes from:
  (default)    the ledger in this checkout
  --remote     the dashboard's API. Needs APEX_API_URL and APEX_API_KEY in the environment. Read, claim and halt only
  --fixtures   a small made-up ledger that ships with the tool. Read-only
  --json       print the answer as JSON, in the same shape the API sends

Exit codes: 0 ok, 1 error, 2 usage, 3 halted or blocked, 4 verification failed.
There is no \`apex resume\`: resuming is Jeremy's, on the dashboard.`;

type Args = { _: string[]; flags: Record<string, string | boolean> };
const SWITCHES = new Set(['full', 'dry-run', 'write', 'check', 'json', 'request', 'remote', 'local', 'fixtures', 'trades', 'intents', 'events', 'drift', 'positions', 'fills', 'blocked', 'wait', 'list', 'once', 'help']);
export function parse(argv: string[]): Args {
  const a: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) { const x = argv[i];
    if (x.startsWith('--')) { const [k, v] = x.slice(2).split('='); if (v !== undefined) a.flags[k] = v; else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-') && !SWITCHES.has(k)) a.flags[k] = argv[++i]; else a.flags[k] = true; }
    else if (x === '-n') a.flags.n = argv[++i]; else a._.push(x); }
  return a;
}
class Usage extends Error {}
const usd = (x: number) => `$${x.toFixed(2)}`, whenMs = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : 'never');

/** A file ledger that fails its own chain check is refused by the store, so it cannot be opened at all. For the commands whose
 *  job is to verify, that refusal is the finding (exit 4), not an error. */
const damaged = (e: unknown): LedgerVerify | null => { const m = /ledger file is damaged at seq (\d+): (.*)$/.exec((e as Error)?.message ?? ''); return m ? { ok: false, from: 1, to: Number(m[1]), checked: Number(m[1]), badSeq: Number(m[1]), why: m[2] } : null; };

/** Pull the cord where the answers come from. Shared by `apex halt` and the H key in the full-screen view. */
async function pullCord(s: Source, reason: string): Promise<{ data: HaltResult; text: string }> {
  if (s.mode === 'fixtures') throw new Usage('The fixture ledger is read-only, so nothing was halted.');
  const r = await s.call('halt', { body: { reason: reason.slice(0, 300) } });
  return { data: r, text: `${r.already ? 'The andon cord was already pulled' : 'Andon cord pulled'} ${s.mode === 'remote' ? 'on the dashboard' : 'in this ledger'} (ledger: ${r.ledger.replace('_', ' ')}). No new entries will be opened until it is resumed on the dashboard.` };
}

export async function main(argv: string[], ctx: Ctx = makeCtx(resolve(process.env.APEX_ROOT || process.cwd())), print: (s: string) => void = s => console.log(s)): Promise<number> {
  const a = parse(argv);
  try { return await dispatch(a, ctx, print); }
  catch (e) {
    if (e instanceof Usage) { print(e.message); return 2; }
    if (e instanceof SourceError) { print(a.flags.json ? JSON.stringify({ code: e.code, detail: e.message, retryAfterSec: e.retryAfterSec }, null, 1) : `apex: ${e.message}${e.retryAfterSec ? ` Try again in ${e.retryAfterSec} seconds.` : ''}`);
      return e.code === 'validation' ? 2 : e.code === 'halted' || e.code === 'budget' ? 3 : 1; }
    throw e;
  }
}

async function dispatch(a: Args, ctx: Ctx, print: (s: string) => void): Promise<number> {
  const [cmd, sub, arg] = a._, cfg = loadConfig(ctx.env, 'cli'), json = !!a.flags.json;
  const withStore = async <T>(f: (entries: Awaited<ReturnType<Awaited<ReturnType<typeof openStore>>['store']['read']>>, o: Awaited<ReturnType<typeof openStore>>) => Promise<T> | T) => { const o = await openStore(ctx); try { return await f(await o.store.read(), o); } finally { await o.close(); } };
  // --fixtures and --remote are asked for by name. Without either, both API settings in the environment mean remote, unless --local.
  const wantRemote = !!a.flags.remote || (!a.flags.local && !a.flags.fixtures && !!ctx.env.APEX_API_URL && !!ctx.env.APEX_API_KEY);
  const src = (): Source => { if (a.flags.fixtures) return localSource(ctx, { fixtures: true }); if (!wantRemote) return localSource(ctx); const s = remoteSource(ctx.env, ctx.fetch); if ('error' in s) throw new Usage(s.error); return s; };
  const localOnly = () => { if (a.flags.remote || a.flags.fixtures) throw new Usage(`apex ${cmd} works only on the ledger in this checkout, so it takes neither --remote nor --fixtures.`); };
  const str = (k: string) => (typeof a.flags[k] === 'string' ? a.flags[k] as string : undefined);
  const num = (k: string, def: number, min: number, max: number) => { if (a.flags[k] === undefined) return def; const n = Number(a.flags[k]); if (!Number.isInteger(n) || n < min || n > max) throw new Usage(`--${k} must be a whole number from ${min} to ${max}.`); return n; };
  /** Print one answer: the API's shape with --json, text otherwise. `book` commands open with the PAPER line. */
  const out = async (s: Source, data: unknown, text: () => string, book = true) => { if (json) { print(JSON.stringify(data, null, 1)); return; } if (book) print(R.header(await s.call('status'))); print(text()); };
  const pageOf = <T>(items: T[]) => ({ items, next: null });

  switch (cmd) {
    case undefined: case 'help': case '--help': print(HELP); return 0;

    case 'run': case 'validate': {
      localOnly();
      const mode = cmd === 'validate' ? 'validator' : a.flags.full ? 'full' : 'tick', seed = str('seed'), seedIfEmpty = str('seed-if-empty');
      if ((seed && !/^plan:[\w.-]+$/.test(seed)) || (seedIfEmpty && !/^plan:[\w.-]+$/.test(seedIfEmpty))) { print('--seed must name an approved plan item, like plan:P1.13'); return 2; }
      const r = await execute(ctx, { mode, budget: a.flags.budget ? Number(a.flags.budget) : undefined, dryRun: !!a.flags['dry-run'], seedSource: seed, seedIfEmpty, level: (a.flags.level as any) ?? 'L1' });
      print(json ? JSON.stringify({ report: r.out.report, head: r.head }, null, 1) : cmd === 'validate' ? validatorSummary(r.out.appends) : r.markdown);
      print(`\n${a.flags['dry-run'] ? 'Dry run: nothing was written.' : `Ledger: ${r.store}, head seq ${r.head?.seq ?? 0}.`}${r.reportPath ? ` Report: ${r.reportPath}` : ''}`);
      if (a.flags.send === 'telegram' && !a.flags['dry-run']) { const t = await sendTelegram(ctx.env, r.short); print(t.sent ? 'Sent to Telegram.' : `Not sent to Telegram: ${t.why}.`); }
      if (r.out.pullAndon) { print(`ANDON: ${r.out.pullAndon}`); return 3; }
      return 0;
    }

    case 'status': { const s = src(), st = await s.call('status'); if (json) { print(JSON.stringify(st, null, 1)); return 0; }
      const has = st.ledger === 'postgres' || st.ledger === 'file';
      print(R.statusText(st, has ? await all<Slot>(s, 'slots') : [], has ? await s.call('book') : null)); return 0; }

    case 'board': { const s = src(), sort = str('sort'); if (sort && sort !== 'checks' && sort !== 'sharpe') throw new Usage('--sort is checks or sharpe. The board is never sorted by return.');
      let rows = await all<Evaluation>(s, 'board', { query: { status: str('status'), market: str('market'), tf: str('tf'), q: str('q') } }); const total = rows.length;
      if (sort === 'sharpe') rows = [...rows].sort((x, y) => y.metrics.sharpe.value - x.metrics.sharpe.value);
      if (sort === 'checks') rows = [...rows].sort((x, y) => y.checksPassed - x.checksPassed || y.metrics.sharpe.value - x.metrics.sharpe.value);
      const top = rows.slice(0, num('top', 25, 1, 2000)); await out(s, pageOf(top), () => R.boardText(top, total, sort)); return 0; }

    case 'pair': { if (!sub) throw new Usage('Usage: apex pair <strategy> <dataset>, or apex pair <trial key>'); const s = src(); let trialKey = sub;
      if (arg) { const hit = (await all<Evaluation>(s, 'board', { query: { q: sub } })).find(r => r.strategy === sub && r.panel === arg); if (!hit) { print(`No evaluation of ${sub} on ${arg} is in the ledger.`); return 1; } trialKey = hit.trialKey; }
      const p = await s.call('pair', { params: { trialKey } }); await out(s, p, () => R.pairText(p)); return 0; }

    case 'slots': { const s = src(), rows = await all<Slot>(s, 'slots'); await out(s, pageOf(rows), () => R.slotsText(rows)); return 0; }

    case 'slot': { if (!sub) throw new Usage('Usage: apex slot <key> [--trades | --intents | --events | --drift]'); const s = src(), params = { key: sub };
      if (a.flags.trades) { const r = await all<Trade>(s, 'slotTrades', { params }); await out(s, pageOf(r), () => R.tradesText(r)); return 0; }
      if (a.flags.events) { const r = await all<SlotEvent>(s, 'slotEvents', { params }); await out(s, pageOf(r), () => R.eventsText(r)); return 0; }
      if (a.flags.drift) { const r = await all<DriftReading>(s, 'slotDrift', { params }); await out(s, pageOf(r), () => R.driftText(r)); return 0; }
      if (a.flags.intents) { await s.call('slot', { params }); const r = (await all<Intent>(s, 'intents')).filter(i => i.slotKey === sub); await out(s, pageOf(r), () => R.intentsText(r)); return 0; }
      const d = await s.call('slot', { params }); await out(s, d, () => R.slotText(d)); return 0; }

    case 'book': { const s = src();
      if (a.flags.positions) { const r = await all<Position>(s, 'positions'); await out(s, pageOf(r), () => R.positionsText(r)); return 0; }
      if (a.flags.fills) { const r = await all<Fill>(s, 'fills'); await out(s, pageOf(r), () => R.fillsText(r)); return 0; }
      if (a.flags.blocked) { const r = await all<Intent>(s, 'intents', { query: { ok: 'false' } }); await out(s, pageOf(r), () => (r.length ? R.intentsText(r) : 'The risk guard has not blocked an order yet.')); return 0; }
      if (a.flags.trades) { const r: Trade[] = []; for (const x of await all<Slot>(s, 'slots')) r.push(...await all<Trade>(s, 'slotTrades', { params: { key: x.slotKey } }));
        r.sort((x, y) => (x.exitAt < y.exitAt ? 1 : x.exitAt > y.exitAt ? -1 : 0)); await out(s, pageOf(r), () => R.tradesText(r)); return 0; }
      const b = await s.call('book'); await out(s, b, () => R.bookText(b)); return 0; }

    case 'risk': { const s = src(), r = await s.call('risk'); await out(s, r, () => R.riskText(r)); return 0; }

    case 'queue': { if (sub && sub !== 'list') throw new Usage(`apex queue ${sub} is not a command. The terminal lists the queue; adding, approving and dropping are done on the dashboard, by Jeremy.`);
      const s = src(), q = await s.call('queue'); await out(s, q, () => R.queueText(q)); return 0; }

    case 'costs': { const s = src(), c = await s.call('costs');
      if (c || json || s.mode !== 'local') { await out(s, c, () => R.costsText(c), false); return 0; }
      // Nothing is recorded yet in this checkout: show the model the first run will record.
      print(`No run has recorded a cost model yet. The first run will record this one: ${PRIOR_COSTS.version.slice(0, 12)} (one way, basis points). Every row is assumed until paper fills are measured.\n`);
      print(R.table([['venue', 'class', 'bucket', 'fee', 'half spread', 'slip', 'source', 'n'], ...PRIOR_COSTS.rows.map(r => [r.venue, r.assetClass, r.bucket, r.feeBps, r.halfSpreadBps, r.slipBps, r.source, r.n])])); return 0; }

    case 'data': {
      if (sub === 'pull') { localOnly(); const r = await pullData(ctx); for (const x of r.pulled) print(`Pulled ${x}.`); for (const x of r.problems) print(`Problem: ${x}.`); if (!r.pulled.length && !r.problems.length) print('Nothing to pull.'); return 0; }
      if (sub && sub !== 'health') throw new Usage('Usage: apex data health | pull');
      // Away from a checkout the answer is what the last run recorded. In a checkout it is a fresh check of the files themselves.
      if (a.flags.fixtures || wantRemote) { const s = src(), rows = await all<DataHealth>(s, 'dataHealth'); await out(s, pageOf(rows), () => R.dataText(rows), false); return rows.some(r => r.status === 'blocked') ? 1 : 0; }
      const d = loadData(ctx), rows = d.datasets.map((x, i) => ({ dataset: x.spec.id, bars: x.bars.length, last: x.bars.length ? new Date(x.bars[x.bars.length - 1].t).toISOString() : null, status: d.health[i].status, tradable: d.health[i].tradable, notes: d.health[i].checks.filter(c => c.status !== 'ok').map(c => `${c.id}: ${c.detail}`) }));
      if (json) print(JSON.stringify({ items: rows, problems: d.problems }, null, 1));
      else { print(R.table([['dataset', 'bars', 'last bar', 'status', 'tradable', 'notes'], ...rows.map(r => [r.dataset, r.bars, R.when(r.last), r.status, r.tradable ? 'yes' : 'no', r.notes.join('; ')])])); for (const p of d.problems) print(`Problem: ${p}`); }
      return d.health.some(h => h.status === 'blocked') ? 1 : 0; }

    case 'report': {
      const id = str('id'), date = str('date'); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Usage('--date is YYYY-MM-DD.');
      const send = async (md: string) => { if (a.flags.send === 'telegram') { const t = await sendTelegram(ctx.env, md.split('\n## 6.')[0]); print(t.sent ? 'Sent to Telegram.' : `Not sent to Telegram: ${t.why}.`); } };
      if (a.flags.list) { const s = src(), rows = await all<ReportRow>(s, 'reports'); await out(s, pageOf(rows), () => R.reportsText(rows), false); return 0; }
      if (!id && !date && !json && !a.flags.fixtures && !wantRemote) {
        const p = join(ctx.stateDir, 'reports', 'latest.md'); if (!existsSync(p)) { print('No report yet. Run `apex run` first.'); return 1; }
        const md = readFileSync(p, 'utf8'); print(md); await send(md); return 0; }
      const s = src(), rows = await all<ReportRow>(s, 'reports', {}, 400), row = id ? rows.find(r => r.id === id) : date ? rows.find(r => r.ts.startsWith(date)) : rows[0];
      if (!row) { print(id || date ? `No run matches ${id ?? date}. List them with: apex report --list` : 'No run is recorded yet.'); return 1; }
      if (json) { print(JSON.stringify(await s.call('report', { params: { id: row.id } }), null, 1)); return 0; }
      const md = await s.reportMarkdown(row.id).catch(e => { if (e instanceof SourceError && e.code === 'not_found') return null; throw e; });
      print(md ?? `${R.reportsText([row])}\n\nThe text of this report is not kept ${s.mode === 'remote' ? 'on the dashboard' : 'here'}. The counts above are from the ledger.`); if (md) await send(md); return 0; }

    case 'ledger': {
      if (sub === 'replay') { localOnly(); return withStore(entries => { const r = verifyChain(entries); if (!r.ok) { print(R.verifyText({ ok: false, from: 1, to: entries.length, checked: entries.length, badSeq: r.badSeq ?? null, why: r.why ?? null })); return 4; }
        const v = buildView(entries, cfg.paperCapital); print(`Replayed ${entries.length} entries: ${v.trials.size} trials, ${v.slots.size} slots, ${v.closed.length} closed trades, cash ${usd(v.cash)}.`); return 0; }).catch(e => { const v = damaged(e); if (!v) throw e; print(json ? JSON.stringify(v, null, 1) : R.verifyText(v)); return 4; }); }
      if (sub === 'anchor') { localOnly(); if (cfg.ledgerAnchor === 'off') { print('Anchoring is switched off (APEX_LEDGER_ANCHOR=off). Nothing was saved.'); return 0; }
        const o = await openStore(ctx), release = await o.lock(); if (!release) { await o.close(); print('Another run holds the lock. Nothing was saved.'); return 3; }
        try { const entries = await o.store.read(), chain = verifyChain(entries), heads = chain.ok ? checkHeads(entries, readHeads(ctx.stateDir)) : null;
          if (!chain.ok || !heads!.ok) { print(`The ledger does not verify (${chain.ok ? heads!.why : `entry ${chain.badSeq}: ${chain.why}`}), so nothing was anchored.`); return 4; }
          const plan = planAnchor(entries, ctx.now()); if ('skip' in plan) { print(plan.skip); return 0; }
          const file = writeHead(ctx.stateDir, plan.head); await new Ledger(o.store, ctx.now).append('anchor', 'cli', { seq: plan.head.seq, hash: plan.head.hash, file });
          print(`Anchored entry ${plan.head.seq} (${plan.head.hash.slice(0, 12)}) in ${file}.${cfg.ledgerAnchor === 'git+ots' ? ' An OpenTimestamps proof is not built yet, so none was made.' : ''} It counts once that file is committed.`); return 0;
        } finally { await release(); await o.close(); } }
      const s = src();
      if (sub === 'head' || !sub) { const h = await s.call('ledgerHead'); await out(s, h, () => R.headText(h), false); return 0; }
      if (sub === 'tail') { const rows = (await s.call('ledger', { query: { limit: num('n', 10, 1, 200), kind: str('kind'), slot: str('slot') } })).items.reverse(); await out(s, pageOf(rows), () => R.ledgerRows(rows as LedgerRow[]), false); return 0; }
      if (sub === 'show') { if (!/^\d+$/.test(arg ?? '')) throw new Usage('Usage: apex ledger show <seq>'); const e = await s.call('ledgerEntry', { params: { seq: arg } }); await out(s, e, () => R.ledgerEntryText(e), false); return 0; }
      if (sub === 'verify') {
        let v: LedgerVerify; const from = num('from', 1, 1, 1e9), head = await s.call('ledgerHead').catch(e => { const bad = damaged(e); if (!bad) throw e; return bad; });
        if ('ok' in head) { print(json ? JSON.stringify(head, null, 1) : R.verifyText(head)); return 4; }
        if (s.mode === 'local') v = await withStore(entries => { const before = from > 1 ? entries[from - 2] : null, part = entries.slice(from - 1), r = verifyChain(part, before ? { seq: before.seq, hash: before.hash } : null); return { ok: r.ok, from, to: entries.length ? entries[entries.length - 1].seq : 0, checked: part.length, badSeq: r.ok ? null : r.badSeq ?? null, why: r.ok ? null : r.why ?? null }; });   // the whole chain in one pass
        else { v = { ok: true, from, to: 0, checked: 0, badSeq: null, why: null };
          for (let at = from; at <= head.seq && v.ok; at = v.to + 1) { const part = await s.call('ledgerVerify', { query: { from: at } }); v = { ok: part.ok, from, to: part.to, checked: v.checked + part.checked, badSeq: part.badSeq, why: part.why }; if (part.to < at) break; } }
        // In a checkout, the heads saved by earlier anchors are checked too: a ledger rewritten after an anchor no longer matches it.
        let anchors = ''; if (s.mode === 'local' && v.ok && from === 1) { const h = await withStore(entries => checkHeads(entries, readHeads(ctx.stateDir))); if (!h.ok) v = { ...v, ok: false, badSeq: h.badSeq, why: h.why }; else anchors = `\nanchors ${h.checked ? `${h.checked} saved ${h.checked === 1 ? 'head matches' : 'heads match'} the chain` : 'no head has been saved yet'}`; }
        await out(s, v, () => `${R.verifyText(v)}${anchors}\n${R.headText(head).split('\n').map(l => `head    ${l}`).join('\n')}`, false);
        return v.ok ? 0 : 4; }
      throw new Usage('Usage: apex ledger head | tail [-n N] | show <seq> | verify [--from N] | replay | anchor'); }

    case 'strategies': { localOnly();
      if (sub === 'fingerprint') { const f = fingerprints(ctx), p = join(ctx.root, 'packages/engine/fingerprints.json');
        if (a.flags.write) { writeFileSync(p, JSON.stringify(f.now, null, 1) + '\n'); print(`Wrote ${Object.keys(f.now.strategies).length} fingerprints. Changes: ${f.diffs.length ? f.diffs.join('; ') : 'none'}.`); return 0; }
        if (!f.diffs.length) { print(`Fingerprints match: ${Object.keys(f.now.strategies).length} strategies, engine ${f.now.engine.slice(0, 12)}.`); return 0; }
        print(`Fingerprints differ from the committed file:\n${f.diffs.map(d => `  ${d}`).join('\n')}\nIf the change is intended, run with --write and commit the diff. A strategy that is locked in paper must not change: register a new id instead.`); return 1; }
      const f = fingerprints(ctx), row = (s: typeof STRATEGIES[number]) => ({ id: s.id, tf: s.tf, direction: s.direction, source: s.source, fingerprint: f.now.strategies[s.id], name: s.name });
      if (sub === 'show') { const s = STRATEGIES.find(x => x.id === arg); if (!s) { print(`No strategy has the id ${arg ?? '(none given)'}. List them with: apex strategies list`); return arg ? 1 : 2; }
        const r = row(s); print(json ? JSON.stringify(r, null, 1) : R.table(Object.entries(r).map(([k, v]) => [k, String(v)]))); return 0; }
      if (sub && sub !== 'list') throw new Usage('Usage: apex strategies list | show <id> | fingerprint [--write | --check]');
      const rows = STRATEGIES.map(row); print(json ? JSON.stringify({ items: rows }, null, 1) : R.table([['id', 'tf', 'direction', 'source', 'fingerprint', 'name'], ...rows.map(r => [r.id, r.tf, r.direction, r.source, r.fingerprint.slice(0, 12), r.name])])); return 0;
    }

    case 'claim': {
      if (!sub || (sub !== '-' && !existsSync(resolve(sub)))) { print('Give a text file (or - for standard input): apex claim <file> --extraction <json>'); return 2; }
      const text = readFileSync(sub === '-' ? 0 : resolve(sub), 'utf8').replace(/^<!-- source: [^\n]*-->\s*/, '');       // files in archive/ start with Apex's own provenance line
      const kind = str('kind') ?? (/\.pine$/i.test(sub) ? 'pine' : 'transcript'), inp = intake(text, kind);
      if (!inp.ok) { print(`Not checked: ${inp.error}.`); return 2; }
      if (a.flags.request) { print(JSON.stringify(extractionRequest(inp.intake), null, 1)); return 0; }
      const ex = str('extraction'); let raw: unknown = undefined;
      if (ex) { if (!existsSync(resolve(ex))) throw new Usage(`There is no file at ${ex}.`); try { raw = JSON.parse(readFileSync(resolve(ex), 'utf8')); } catch { raw = null; } }
      if (a.flags.fixtures) throw new Usage('The fixture ledger is read-only, so a claim check cannot be recorded in it.');
      if (wantRemote) {
        // The dashboard runs the check and records it. With no --extraction it makes the extraction itself, through its own gateway.
        const s = src(), r = await s.call('claimCheckStart', { body: { kind: kind as ClaimCheckBody['kind'], text, ...(ex ? { extraction: raw } : {}) } });
        if (json) print(JSON.stringify(r, null, 1)); else print([r.headline, `Verdict: ${r.verdict ?? 'none'}. Tries used by this check: ${r.trialsUsed}.${r.repeated ? ' This is the same check as before, not run again.' : ''}`, `Check ${r.id}${r.receipt ? `, receipt #${r.receipt}` : ''}. The full result: apex ledger show ${r.receipt ?? '<seq>'} --remote`].join('\n'));
        return 0; }
      if (!ex) { print('The command line never calls a model. Run the extraction in the app, or pass its saved answer: --extraction <json>. Use --request to print the prompt and schema.'); return 2; }
      const v = validateExtraction(raw, inp.intake), extracted: Extracted = v.ok ? { ok: true, extraction: v.extraction, attempts: 1 } : { ok: false, reason: EXTRACT_FAILED, errors: v.errors, attempts: 1 };
      if (!v.ok) print(`The extraction failed its checks:\n${v.errors.map(e => `  - ${e}`).join('\n')}\n`);
      const r = await claimCheck(ctx, inp.intake, extracted, { dryRun: !!a.flags['dry-run'] });
      print(r.markdown); print(a.flags['dry-run'] ? 'Dry run: nothing was written.' : `Ledger: ${r.store}, head seq ${r.head?.seq ?? 0}.`);
      return r.out.result.status === 'waiting_budget' ? 3 : 0;
    }

    case 'signoff': { localOnly();
      // Jeremy's own command (docs/design/10 s3.2). It needs the key, which exists only on his machine, and a person at the keyboard.
      const reason = (str('reason') ?? '').trim(), key = ctx.env.APEX_SIGNOFF_KEY;
      if (!sub || !reason) { print('Usage: apex signoff <path> --reason "<why this red path may change>"'); return 2; }
      if (!key) { print('Refused: APEX_SIGNOFF_KEY is not set. It exists only on Jeremy\'s own machine, so a sign-off cannot be made here.'); return 2; }
      if (!ctx.confirm) { print('Refused: a sign-off needs a person at a real terminal. This session has none.'); return 2; }
      const path = relative(ctx.root, resolve(ctx.root, sub)).split('\\').join('/');
      if (path.startsWith('..')) { print('Refused: that path is outside the repo.'); return 2; }
      if (!(await ctx.confirm(`Sign off one change to ${path} for 48 hours? Type the path to confirm: `, path))) { print('Not signed. The path typed did not match.'); return 2; }
      const s = makeSignoff(ctx.root, path, reason.slice(0, 300), key, ctx.now()), file = join(ctx.root, '.apex/signoff', `${createHash('sha256').update(path).digest('hex')}.json`);
      mkdirSync(join(ctx.root, '.apex/signoff'), { recursive: true }); writeFileSync(file, JSON.stringify(s, null, 1) + '\n');
      print(`Signed: ${path} may be edited until ${s.expires}, as long as it is still the file you signed for. The edit still goes through a pull request and your review.`); return 0;
    }

    case 'halt': { const reason = a._.slice(1).join(' ').trim(); if (!reason) { print('Say why: apex halt "<reason>"'); return 2; }
      const r = await pullCord(src(), reason); print(json ? JSON.stringify(r.data, null, 1) : r.text); return 0; }

    case 'live': { if (sub !== 'status') throw new Usage('Usage: apex live status [slot]. Nothing in the terminal opens a lock.');
      const s = src(), keys = arg ? [arg] : (await all<Slot>(s, 'slots')).map(x => x.slotKey), locks: Locks[] = []; for (const k of keys) locks.push(await s.call('locks', { params: { slotKey: k } }));
      await out(s, pageOf(locks), () => ['Live trading is off. Going live needs all four locks, and the last three are Jeremy\'s alone.', '', ...(locks.length ? locks.map(R.locksText) : ['No slot exists, so lock 1 (graduated in paper) is closed for everything.']),
        '', `Stages once live is allowed: ${STAGES.map(x => `${x.id} (${x.size * 100}% size)`).join(' -> ')}.`].join('\n'), false); return 0; }

    case 'doctor': { localOnly(); const opened = await openStore(ctx); let entries: Awaited<ReturnType<typeof opened.store.read>> = [], broken: LedgerVerify | null = null;
      try { entries = await opened.store.read(); } catch (e) { broken = damaged(e); if (!broken) throw e; } finally { await opened.close(); }
      { const o = opened, chain = broken ? { ok: false, badSeq: broken.badSeq } : verifyChain(entries), f = fingerprints(ctx), d = loadData(ctx), tg = !!(ctx.env.TELEGRAM_BOT_TOKEN && ctx.env.TELEGRAM_CHAT_ID), live = !ctx.env.APEX_ALLOW_LIVE && !ctx.env.ALPACA_LIVE;
      const checks: { check: string; ok: boolean; detail: string }[] = [{ check: 'config', ok: cfg.problems.length === 0, detail: cfg.problems.join('; ') || 'ok' },
        { check: 'ledger', ok: chain.ok, detail: chain.ok ? `${o.kind}, ${entries.length} entries, chain intact` : `broken at seq ${chain.badSeq}${broken?.why ? `: ${broken.why}` : ''}` },
        { check: 'fingerprints', ok: f.diffs.length === 0, detail: f.diffs.join('; ') || `${Object.keys(f.now.strategies).length} strategies match` },
        { check: 'data', ok: d.health.every(h => h.status !== 'blocked') && !d.problems.length, detail: `${d.datasets.length} datasets, ${d.health.filter(h => h.status === 'blocked').length} blocked, ${d.health.filter(h => !h.tradable).length} not tradable (stale data cannot open orders)` },
        { check: 'gate', ok: true, detail: `standard-bar ${gateVersion(GATE_V1).slice(0, 12)}: ${passBar(GATE_V1)}` },
        { check: 'telegram', ok: tg, detail: tg ? 'configured' : 'not configured: reports are saved but not sent' }, { check: 'live', ok: live, detail: live ? 'off' : 'a live flag is set in this environment' }];
      if (json) print(JSON.stringify({ checks, warnings: cfg.warnings }, null, 1)); else { print(R.table([['check', 'ok', 'detail'], ...checks.map(c => [c.check, c.ok ? 'yes' : 'NO', c.detail])])); for (const w of cfg.warnings) print(`Warning: ${w}`); }
      // A broken chain or a changed strategy is a failed verification (4). A bad setting or blocked data is an error (1).
      return !checks[1].ok || !checks[2].ok ? 4 : checks[0].ok && checks[3].ok ? 0 : 1; } }

    case 'tui': { const s = src(); return runTui(s, { now: ctx.now, once: !!a.flags.once, cols: a.flags.cols ? num('cols', 100, 40, 400) : undefined, rows: a.flags.rows ? num('rows', 30, 12, 200) : undefined, print, halt: async reason => (await pullCord(s, reason)).text }); }

    case 'mcp': { const s = a.flags.fixtures || wantRemote ? src() : localSource(ctx, { actor: 'mcp' }); return (await import('./mcp')).serveStdio(s, ctx); }

    case 'completion': { const text = completion(sub ?? '', COMMANDS, GLOBAL_FLAGS); if (!text) throw new Usage('Usage: apex completion bash | zsh | fish'); print(text); return 0; }

    default: print(`Unknown command: ${cmd}\n\n${HELP}`); return 2;
  }
}

function validatorSummary(appends: { kind: string; payload: any }[]): string { const v = appends.filter(x => x.kind === 'validator_run').map(x => x.payload);
  return v.length ? ['Validator runs:', ...v.map(x => `- ${x.purpose} ${x.level} on ${x.slotKey ?? x.trialKey.slice(0, 12)}: ${x.agrees ? (x.exact ? 'agrees exactly' : 'agrees within tolerance') : `DISAGREES (${x.diffs.join('; ')})`}`)].join('\n') : 'Nothing was waiting for the validator.'; }

if (require.main === module) main(process.argv.slice(2), { ...makeCtx(resolve(process.env.APEX_ROOT || process.cwd())), confirm: terminalConfirm() }).then(c => process.exit(c), e => { console.error(`apex: ${(e as Error).message}`); process.exit(1); });
