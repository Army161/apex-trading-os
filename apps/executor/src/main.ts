#!/usr/bin/env -S npx tsx
// apex-executor (docs/design/02 s6). Red path. Runs only on Jeremy's machine and is the only code that would ever hold live keys.
// It is a separate binary from the apex command line, which has no order, sign or go-live command and never will.
//   status            every slot's four locks and what is missing. Reads only.
//   sign <slot>       lock 4: signs the slot's latest live approval with APEX_SIGNOFF_KEY, after Jeremy types the slot key.
//   run [--once]      rehearsal (the default): steps 0 to 5, and what would have been sent goes to the journal. Sends nothing.
//   run --live        refuses unless an adapter is installed, both live flags are set and all four locks are open. No adapter exists.
import { createInterface } from 'node:readline';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Ledger, verifyChain, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';
import { liveAllowed, lockFactsOf, serverLocksOpen, signApproval, STAGES, verifyApproval } from '@apex/kernel/locks';
import { buildView } from '@apex/kernel/view';
import { loadConfig } from '@apex/kernel/config';
import { FileLedgerStore, fileLock } from '@apex/store/file';
import { DryRunBroker, type LiveBroker } from './broker';
import { cursorOf, FileJournal, type Mode } from './journal';
import { readSignature, writeSignature } from './signature';
import { executeIntent, mirrorOf, pendingIntents, retryPosts, type Env, type ExecResult, type SavedHeads } from './steps';

export type Opened = { store: LedgerStore; close: () => Promise<void> };
/** Everything from outside is passed in, so the tests run with no network, no real key and no terminal. */
export type Ctx = {
  env: Env; now: () => number; cwd: string; print: (s: string) => void; fetch: typeof fetch;
  /** Asks a person at the keyboard to type `expect`. Absent when there is no real terminal, and `sign` refuses. */
  confirm?: (question: string, expect: string) => Promise<boolean>;
  /** The live broker adapter. None exists: the venue is not chosen (docs/design/02 s6). Only the tests pass one, a fake. */
  adapter?: () => LiveBroker | null;
  openLedger?: () => Promise<Opened>;
  sleep?: (ms: number) => Promise<void>;
};

const USAGE = 'Usage: apex-executor status | sign <slot> | run [--once] [--live]';
const NO_ADAPTER = 'Refused: no live broker adapter is installed. The venue is not chosen, and the adapter is written only when a slot reaches lock 3 (docs/design/02 s6). Run without --live to rehearse.';

/** Where the journal and signatures live: outside any git checkout, on this machine only. */
export function executorDir(ctx: Ctx): string { return resolve(ctx.env.APEX_EXECUTOR_DIR || join(homedir(), '.apex', 'executor')); }
function insideRepo(dir: string): boolean { for (let p = dir; ; p = dirname(p)) { if (existsSync(join(p, '.git'))) return true; if (dirname(p) === p) return false; } }

async function defaultLedger(ctx: Ctx): Promise<Opened> {
  if (ctx.env.DATABASE_URL) {
    const { PgLedgerStore } = await import('@apex/store/pg'), pg = (await import('pg')).default, store = new PgLedgerStore(new pg.Pool({ connectionString: ctx.env.DATABASE_URL, max: 2 }));
    return { store, close: () => store.close() };
  }
  const path = ctx.env.APEX_LEDGER_FILE || join(ctx.env.APEX_STATE_DIR || join(ctx.cwd, '.apex'), 'ledger.jsonl');
  if (!existsSync(path)) throw new Error(`no ledger at ${path}. Set DATABASE_URL or APEX_LEDGER_FILE.`);
  return { store: new FileLedgerStore(path), close: async () => {} };
}

/** A short alert to Jeremy's Telegram, when it is configured. The URL holds the token, so it is never printed. */
async function telegram(ctx: Ctx, text: string) {
  const token = ctx.env.TELEGRAM_BOT_TOKEN, chat = ctx.env.TELEGRAM_CHAT_ID; if (!token || !chat) return;
  try { await ctx.fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }), signal: AbortSignal.timeout(5000) }); }
  catch { /* the console and the exit code still say it */ }
}

/** Ledger heads saved by `apex ledger anchor` under the state folder, when this checkout has them. Same format as apps/cli/src/anchor.ts. */
function savedHeads(ctx: Ctx): SavedHeads {
  const dir = join(ctx.env.APEX_STATE_DIR || join(ctx.cwd, '.apex'), 'heads'), out: SavedHeads = { heads: [], unreadable: [] };
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort()) {
    try { const h = JSON.parse(readFileSync(join(dir, n), 'utf8')); if (!Number.isInteger(h.seq) || h.seq < 1 || !/^[0-9a-f]{64}$/.test(h.hash)) throw new Error('bad'); out.heads.push({ seq: h.seq, hash: h.hash, date: n.slice(0, 10) }); }
    catch { out.unreadable.push(n); }
  }
  return out;
}
/** Only the first stage, at most its size, is signed or sent until a scale check exists. */
const firstStageOnly = (a: { stage: string; sizeCap: number }) => a.stage === STAGES[0].id && a.sizeCap > 0 && a.sizeCap <= STAGES[0].size;

export async function main(argv: string[], ctx: Ctx): Promise<number> {
  const [cmd, arg] = argv.filter(a => !a.startsWith('--')), flags = new Set(argv.filter(a => a.startsWith('--')));
  const print = ctx.print, dir = executorDir(ctx), cfg = loadConfig(ctx.env, 'executor');
  if (!cmd || cmd === 'help' || flags.has('--help')) { print(USAGE); return cmd ? 0 : 2; }
  if (!['status', 'sign', 'run'].includes(cmd)) { print(`Unknown command: ${cmd}\n${USAGE}`); return 2; }
  if (insideRepo(dir)) { print(`Refused: the executor's folder (${dir}) is inside a git checkout. Set APEX_EXECUTOR_DIR to a folder outside any repo.`); return 2; }
  const open = ctx.openLedger ?? (() => defaultLedger(ctx));

  if (cmd === 'status') {
    const o = await open(); let entries: LedgerEntry[]; try { entries = await o.store.read(); } finally { await o.close(); }
    const now = ctx.now(), v = buildView(entries, cfg.paperCapital), chain = verifyChain(entries), key = ctx.env.APEX_SIGNOFF_KEY ?? '';
    let adapter: LiveBroker | null = null; try { adapter = ctx.adapter?.() ?? null; } catch { adapter = null; }
    const flag = !!adapter && (() => { try { return adapter!.liveFlag() === true; } catch { return false; } })(), envFlag = ctx.env.APEX_ALLOW_LIVE === 'yes';
    const out = ['Live trading needs all four locks, an installed adapter and the live flags Jeremy sets himself. `run` rehearses by default.',
      `Ledger: ${entries.length} entries, ${chain.ok ? 'chain intact' : `chain BROKEN at seq ${chain.badSeq}`}. Adapter: ${adapter ? adapter.id : 'none installed (the venue is not chosen)'}.`, ''];
    const slots = [...v.slots.values()].sort((x, y) => (x.slotKey < y.slotKey ? -1 : 1));
    if (!slots.length) out.push('No slot exists, so lock 1 is closed for everything.');
    for (const s of slots) {
      const f = lockFactsOf(v, entries, s.slotKey), a = f.approval, sig = readSignature(dir, s.slotKey);
      const signatureValid = !!a && !!sig && sig.approvalSeq === a.seq && sig.approvalHash === a.hash && sig.expiresAt === a.expiresAt && verifyApproval(key, a.hash, sig.signature);
      const r = liveAllowed(s.slotKey, { ...f, machine: { allowLive: envFlag && flag, signatureValid } }, now);
      const missing = [...r.locks.slice(0, 3).filter(l => !l.open).map(l => l.why), ...(a && !firstStageOnly(a) ? [`the approval is for ${a.stage} with size cap ${a.sizeCap}; only ${STAGES[0].id} up to ${STAGES[0].size} is signed or sent`] : []),
        ...(!a ? [] : key.length < 32 ? ['APEX_SIGNOFF_KEY is missing or short on this machine'] : !sig ? [`no signature: apex-executor sign ${s.slotKey}`] : !signatureValid ? ['the signature is for another approval or does not match'] : []),
        ...(!adapter ? ['no adapter installed'] : !flag ? ['the broker\'s live flag is off'] : []), ...(!envFlag ? ['APEX_ALLOW_LIVE is not yes on this machine'] : [])];
      out.push(`${s.slotKey} (${s.status})`, ...r.locks.map((l, i) => `  ${l.open ? 'open  ' : 'closed'} ${i + 1} ${l.id}: ${l.why}`), `  missing: ${chain.ok ? missing.join('; ') || 'nothing' : `the ledger chain is broken; ${missing.join('; ')}`}`, '');
    }
    print(out.join('\n').trimEnd()); return 0;
  }

  if (cmd === 'sign') {
    // Lock 4's signature. The key exists only on Jeremy's machine and is never printed, logged or written; only the HMAC is saved.
    const key = ctx.env.APEX_SIGNOFF_KEY;
    if (!arg) { print('Usage: apex-executor sign <slot>'); return 2; }
    if (!key) { print('Refused: APEX_SIGNOFF_KEY is not set. It exists only on Jeremy\'s own machine.'); return 2; }
    if (key.length < 32) { print('Refused: APEX_SIGNOFF_KEY is shorter than 32 characters.'); return 2; }
    if (!ctx.confirm) { print('Refused: signing needs a person at a real terminal. This session has none.'); return 2; }
    const o = await open(); let entries: LedgerEntry[]; try { entries = await o.store.read(); } finally { await o.close(); }
    const now = ctx.now(), chain = verifyChain(entries);
    if (!chain.ok) { print(`Refused: the ledger chain is broken at seq ${chain.badSeq}. Nothing was signed.`); return 2; }
    const f = lockFactsOf(buildView(entries, cfg.paperCapital), entries, arg), a = f.approval;
    if (!a) { print(`Refused: there is no live approval for ${arg}. Approve it on its Live panel first.`); return 2; }
    if (!serverLocksOpen(arg, f, now)) { print(`Refused: locks 1 to 3 are not all open for ${arg}, or the approval expired. Nothing was signed.`); return 2; }
    if (!firstStageOnly(a)) { print(`Refused: the approval is for stage ${a.stage} with size cap ${a.sizeCap}. Only ${STAGES[0].id}, at most ${STAGES[0].size} of the paper-sized risk, is signed until a scale check exists. Nothing was signed.`); return 2; }
    const until = new Date(a.expiresAt).toISOString().slice(0, 10);
    if (!(await ctx.confirm(`Sign the live approval at seq ${a.seq} for ${arg}: stage ${a.stage}, size cap ${a.sizeCap} of the paper-sized risk, until ${until}? Type the slot key to confirm: `, arg))) {
      print('Not signed. The slot key typed did not match.'); return 2;
    }
    const path = writeSignature(dir, { slotKey: arg, approvalSeq: a.seq, approvalHash: a.hash, stage: a.stage, sizeCap: a.sizeCap, expiresAt: a.expiresAt, signature: signApproval(key, a.hash), signedAt: now });
    print(`Signed: lock 4's signature for ${arg} is saved in ${path}. It covers this approval only, until ${until}. Live sending still needs an adapter and both live flags.`);
    return 0;
  }

  // run
  const live = flags.has('--live'), mode: Mode = live ? 'live' : 'rehearsal';
  let adapter: LiveBroker | null = null; try { adapter = ctx.adapter?.() ?? null; } catch { adapter = null; }
  if (live) {
    if (!adapter) { print(NO_ADAPTER); return 2; }
    if (ctx.env.APEX_ALLOW_LIVE !== 'yes') { print('Refused: APEX_ALLOW_LIVE is not yes on this machine. Only Jeremy sets it, by hand.'); return 2; }
    let flag = false; try { flag = adapter.liveFlag() === true; } catch { flag = false; }
    if (!flag || adapter.mode !== 'live') { print('Refused: the broker adapter\'s own live flag is off.'); return 2; }
  }
  const journal = new FileJournal(join(dir, 'journal.jsonl')), sleep = ctx.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  // One run at a time on this machine. The lock is never taken over by age: a run left behind by a crash is cleared by hand.
  const lockPath = join(dir, 'run.lock'), release = fileLock(lockPath, Infinity);
  if (!release) { print(`Refused: another apex-executor run holds ${lockPath}. If none is running, check the journal, then delete that file by hand.`); return 2; }
  process.once('exit', release);
  try { return await runLoop(); } finally { release(); process.removeListener('exit', release); }
  async function runLoop(): Promise<number> {
    const pollMs = Math.max(15, Number(ctx.env.APEX_EXECUTOR_POLL_SEC) || 60) * 1000;
    print(live ? 'Live: every intent passes all seven steps or nothing is sent.' : 'Rehearsal: steps 0 to 5 run, and what would have been sent is written to the journal. Nothing is sent.');
    let code = 0;
    for (;;) {
      const o = await open();
      try {
        if (live) { const r = await retryPosts({ env: ctx.env, now: ctx.now, fetch: ctx.fetch, journal }); if (r.posted || r.failed.length) print(`Fills posted from the journal: ${r.posted}.${r.failed.length ? ` Still waiting: ${r.failed.join('; ')}` : ''}`); }
        const start = cursorOf(journal.read(), mode), todo = pendingIntents(await o.store.read(), cfg.paperCapital, start, ctx.now());
        let cursor = start, contiguous = true, stopPass = false;
        for (const e of todo) {
          const entries = await o.store.read(), now = ctx.now();          // re-read: a fill posted for the last intent changes the live book
          let pulled = false;
          const pullAndon = async (reason: string) => {
            pulled = true;
            try { journal.append({ type: 'andon', mode, at: Math.floor(now), reason }); } catch { /* the ledger halt below is what counts */ }
            let written = false;
            // Telegram goes out even when the ledger cannot be written, and then says so.
            try { await new Ledger(o.store, ctx.now).append('halt', 'executor', { level: 'andon', by: 'executor', reason: reason.slice(0, 500) }); written = true; }
            finally { await telegram(ctx, `Apex executor pulled the andon cord: ${reason}${written ? '' : ' The halt could NOT be written to the ledger: halt it from the dashboard by hand.'}`); }
          };
          const broker = live ? adapter! : new DryRunBroker({ inner: adapter, mirror: mirrorOf(entries, cfg.paperCapital, now) });
          const r: ExecResult = await executeIntent({ mode, entries, capital: cfg.paperCapital, env: ctx.env, now: ctx.now, fetch: ctx.fetch, broker, journal,
            signature: k => readSignature(dir, k), heads: () => savedHeads(ctx), pullAndon }, e);
          const last = r.steps[r.steps.length - 1];
          print(`${e.payload.slotKey} intent ${String(e.payload.id).slice(0, 12)} (seq ${e.seq}): ${r.outcome}. Step ${last.n} ${last.id}: ${last.detail}`);
          const final = r.outcome !== 'refused';
          if (contiguous && final) cursor = e.seq; else contiguous = false;
          if (pulled) { code = 4; print('The andon cord is pulled. Nothing more is done until Jeremy resumes from the dashboard.'); stopPass = true; }
          if (r.sent && !(last.n === 7 && last.ok)) stopPass = true;      // a fill not yet in the ledger would break the next reconcile
          if (stopPass) break;
        }
        if (cursor > start) journal.append({ type: 'cursor', mode, at: Math.floor(ctx.now()), seq: cursor });
        if (!todo.length) print('Nothing to do: no new intent for a slot with locks 1 to 3 open.');
      } finally { await o.close(); }
      if (flags.has('--once') || code) return code;
      await sleep(pollMs);
    }
  }
}

function terminalConfirm(): Ctx['confirm'] {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  return (question, expect) => new Promise(done => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(question, ans => { rl.close(); done(ans.trim() === expect); }); });
}

if (require.main === module) {
  for (const [sig, n] of [['SIGINT', 130], ['SIGTERM', 143]] as const) process.on(sig, () => process.exit(n));      // so the run lock is released
  const ctx: Ctx = { env: process.env, now: Date.now, cwd: resolve(process.env.APEX_ROOT || process.cwd()), print: s => console.log(s), fetch, confirm: terminalConfirm(), adapter: () => null };
  main(process.argv.slice(2), ctx).then(c => process.exit(c), e => { console.error(`apex-executor: ${(e as Error).message}`); process.exit(1); });
}
