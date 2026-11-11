#!/usr/bin/env -S npx tsx
// apex: the command line (docs/design/08). Read commands print; `run`, `validate` and `halt` are the only ones that write,
// and they write only ledger entries. There is no order command, no resume command and no way to go live from here.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STRATEGIES } from '@apex/engine/strategies';
import { CEILINGS, DEFAULT_LIMITS, GATE_V1, LIMIT_KEYS, Ledger, STAGES, bookAt, buildView, effectiveLimits, gateVersion, liveAllowed, loadConfig, passBar, slotsEver, trialsEver, verifyChain } from '@apex/kernel';
import { PRIOR_COSTS } from '@apex/autopilot';
import { execute, fingerprints, haltsFrom, loadData, makeCtx, openStore, pullData, sendTelegram, type Ctx } from './runtime';

const HELP = `apex: paper-first trading research. Nothing here places a live order.

  apex status                          Mode, halts, last run, slots, book
  apex run [--full | --budget N] [--dry-run] [--seed plan:<id>] [--send telegram]
                                       Run the pipeline once. --dry-run writes nothing
  apex validate [--level L1|L2]        Independent re-run of anything waiting for the validator
  apex report [--send telegram]        Print the latest report
  apex board [--status S] [--market M] [--top N]
  apex slots | book | risk | costs
  apex data health | pull              pull needs MASSIVE_API_KEY (a data key; it cannot trade)
  apex ledger head | tail [-n N] | show <seq> | verify | replay
  apex strategies list | fingerprint [--write | --check]
  apex halt "<reason>"                 Pull the andon cord. Always allowed
  apex live status                     The four locks, read-only
  apex doctor                          Config, ledger chain, data, fingerprints

There is no \`apex resume\`: resuming is Jeremy's, on the dashboard.`;

type Args = { _: string[]; flags: Record<string, string | boolean> };
export function parse(argv: string[]): Args {
  const a: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) { const x = argv[i];
    if (x.startsWith('--')) { const [k, v] = x.slice(2).split('='); if (v !== undefined) a.flags[k] = v; else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-') && !['full', 'dry-run', 'write', 'check', 'json'].includes(k)) a.flags[k] = argv[++i]; else a.flags[k] = true; }
    else if (x === '-n') a.flags.n = argv[++i]; else a._.push(x); }
  return a;
}
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`, usd = (x: number) => `$${x.toFixed(2)}`, when = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : 'never');
const table = (rows: (string | number)[][]) => { const w = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c] ?? '').length))); return rows.map(r => r.map((x, c) => String(x ?? '').padEnd(w[c])).join('  ').trimEnd()).join('\n'); };

export async function main(argv: string[], ctx: Ctx = makeCtx(resolve(process.env.APEX_ROOT || process.cwd())), print: (s: string) => void = s => console.log(s)): Promise<number> {
  const a = parse(argv), [cmd, sub, arg] = a._, cfg = loadConfig(ctx.env, 'cli');
  const withStore = async <T>(f: (entries: Awaited<ReturnType<Awaited<ReturnType<typeof openStore>>['store']['read']>>, o: Awaited<ReturnType<typeof openStore>>) => Promise<T> | T) => { const o = await openStore(ctx); try { return await f(await o.store.read(), o); } finally { await o.close(); } };
  switch (cmd) {
    case undefined: case 'help': case '--help': print(HELP); return 0;

    case 'run': case 'validate': {
      const mode = cmd === 'validate' ? 'validator' : a.flags.full ? 'full' : 'tick', seed = typeof a.flags.seed === 'string' ? a.flags.seed : undefined;
      const seedIfEmpty = typeof a.flags['seed-if-empty'] === 'string' ? a.flags['seed-if-empty'] as string : undefined;
      if ((seed && !/^plan:[\w.-]+$/.test(seed)) || (seedIfEmpty && !/^plan:[\w.-]+$/.test(seedIfEmpty))) { print('--seed must name an approved plan item, like plan:P1.13'); return 2; }
      const r = await execute(ctx, { mode, budget: a.flags.budget ? Number(a.flags.budget) : undefined, dryRun: !!a.flags['dry-run'], seedSource: seed, seedIfEmpty, level: (a.flags.level as any) ?? 'L1' });
      print(a.flags.json ? JSON.stringify({ report: r.out.report, head: r.head }, null, 1) : cmd === 'validate' ? validatorSummary(r.out.appends) : r.markdown);
      print(`\n${a.flags['dry-run'] ? 'Dry run: nothing was written.' : `Ledger: ${r.store}, head seq ${r.head?.seq ?? 0}.`}${r.reportPath ? ` Report: ${r.reportPath}` : ''}`);
      if (a.flags.send === 'telegram' && !a.flags['dry-run']) { const t = await sendTelegram(ctx.env, r.short); print(t.sent ? 'Sent to Telegram.' : `Not sent to Telegram: ${t.why}.`); }
      if (r.out.pullAndon) { print(`ANDON: ${r.out.pullAndon}`); return 3; }
      return 0;
    }

    case 'report': {
      const p = join(ctx.stateDir, 'reports', 'latest.md'); if (!existsSync(p)) { print('No report yet. Run `apex run` first.'); return 1; }
      const md = readFileSync(p, 'utf8'); print(md);
      if (a.flags.send === 'telegram') { const t = await sendTelegram(ctx.env, md.split('\n## 6.')[0]); print(t.sent ? 'Sent to Telegram.' : `Not sent to Telegram: ${t.why}.`); }
      return 0;
    }

    case 'status': return withStore((entries, o) => {
      const v = buildView(entries, cfg.paperCapital), h = haltsFrom(entries, cfg.paperCapital), lastRun = [...entries].reverse().find(e => e.kind === 'run'), b = bookAt(v, ctx.now());
      const active = [...v.slots.values()].filter(s => s.status !== 'retired');
      print(['Paper mode. Nothing here is proven or guaranteed.', `Ledger: ${o.kind}, ${entries.length} entries.`, `Halts: ${[h.kill && 'kill switch', h.andon && 'andon cord', v.drawdownPaused && 'drawdown pause'].filter(Boolean).join(', ') || 'none'}.`,
        `Last run: ${lastRun ? `${lastRun.payload.id} (${lastRun.payload.mode}) at ${when(lastRun.ts)}, ${lastRun.payload.evaluated} evaluated` : 'never'}.`,
        `Trials ever (N): ${trialsEver(v)}. Slots ever locked (M): ${slotsEver(v)}. In paper now: ${active.length}.`,
        `Book: ${usd(b.equity)} from ${usd(cfg.paperCapital)} (${pct(b.equity / cfg.paperCapital - 1, 2)}, forward, paper, ${v.closed.length} closed trades). Open positions: ${b.positions.length}.`,
        ...(active.length ? [] : ['Nothing has passed yet. The diversified core is the benchmark.'])].join('\n')); return 0; });

    case 'board': return withStore(entries => {
      const v = buildView(entries, cfg.paperCapital); let rows = [...v.trials.values()].map(t => t.result).filter(r => !r.error);
      if (typeof a.flags.status === 'string') rows = rows.filter(r => r.status === a.flags.status); if (typeof a.flags.market === 'string') rows = rows.filter(r => r.symbol === a.flags.market);
      rows.sort((x, y) => y.checks.filter((c: any) => c.pass).length - x.checks.filter((c: any) => c.pass).length || y.metrics.sharpe - x.metrics.sharpe);
      const top = rows.slice(0, Number(a.flags.top ?? 25));
      print('In-sample results on past data. None of this is a forward record.\n');
      print(top.length ? table([['strategy', 'market', 'tf', 'status', 'checks', 'trades', 'return', 'hold', 'sharpe', 'hold sharpe', 'first failed check'],
        ...top.map(r => [r.strategy, r.symbol, r.tf, r.status, `${r.checks.filter((c: any) => c.pass).length}/${r.checks.length}`, r.metrics.trades, pct(r.metrics.ret), pct(r.metrics.hold), r.metrics.sharpe.toFixed(2), r.metrics.holdSharpe.toFixed(2), r.checks.find((c: any) => !c.pass)?.name ?? ''])]) : 'No trials match.');
      print(`\n${rows.length} trials shown of ${v.trials.size}.`); return 0; });

    case 'slots': return withStore(entries => { const v = buildView(entries, cfg.paperCapital), s = [...v.slots.values()];
      print(s.length ? table([['slot', 'status', 'role', 'weight', 'locked', 'book trades', 'cusum', 'last check'], ...s.map(x => [x.slotKey, x.status, x.role, `${(x.weight * 100).toFixed(0)}%`, when(x.lockedAt), v.closed.filter(c => c.slotKey === x.slotKey).length, x.cusum.toFixed(2), x.lastGrad ? `${x.lastGrad.state} (${x.lastGradMonth})` : 'none yet'])]) : 'Nothing has passed yet. The diversified core is the benchmark.'); return 0; });

    case 'book': return withStore(entries => { const v = buildView(entries, cfg.paperCapital), b = bookAt(v, ctx.now());
      print(`Paper book: equity ${usd(b.equity)}, cash ${usd(v.cash)}, peak ${usd(b.peak)}, ${v.closed.length} closed trades (forward, paper, costs assumed).`);
      if (b.positions.length) print(table([['slot', 'side', 'qty', 'entry', 'stop', 'risk'], ...b.positions.map(p => [p.slotKey, p.side === 1 ? 'long' : 'short', p.qty, p.entry.toFixed(2), p.stop.toFixed(2), usd(p.riskUsd)])])); else print('No open positions.');
      return 0; });

    case 'risk': return withStore(entries => { const v = buildView(entries, cfg.paperCapital), snap = effectiveLimits(cfg.limits, v.limits, ctx.now()), h = haltsFrom(entries, cfg.paperCapital);
      print(table([['limit', 'in force', 'requested', 'default', 'ceiling', 'pending'], ...LIMIT_KEYS.map(k => [k, snap.limits[k], cfg.limits[k], DEFAULT_LIMITS[k], CEILINGS[k], (snap.pending as any)[k] ? `${(snap.pending as any)[k].value} since ${when((snap.pending as any)[k].since)}` : ''])]));
      print(`\nA looser value is used only after 24 hours unchanged. Nothing can exceed a ceiling.\nHalts: kill ${h.kill ? 'ON' : 'off'}, andon ${h.andon ? 'PULLED' : 'clear'}, drawdown pause ${v.drawdownPaused ? 'ON' : 'off'}.`); return 0; });

    case 'costs': print(`Cost model ${PRIOR_COSTS.version.slice(0, 12)} (one way, basis points). All rows are assumed until paper fills are measured.\n`);
      print(table([['venue', 'class', 'bucket', 'fee', 'half spread', 'slip', 'source', 'n'], ...PRIOR_COSTS.rows.map(r => [r.venue, r.assetClass, r.bucket, r.feeBps, r.halfSpreadBps, r.slipBps, r.source, r.n])])); return 0;

    case 'data': {
      if (sub === 'pull') { const r = await pullData(ctx); for (const x of r.pulled) print(`Pulled ${x}.`); for (const x of r.problems) print(`Problem: ${x}.`); if (!r.pulled.length && !r.problems.length) print('Nothing to pull.'); return 0; }
      const d = loadData(ctx);
      print(table([['dataset', 'bars', 'last bar', 'status', 'tradable', 'notes'], ...d.datasets.map((x, i) => [x.spec.id, x.bars.length, when(x.bars[x.bars.length - 1]?.t ?? 0), d.health[i].status, d.health[i].tradable ? 'yes' : 'no', d.health[i].checks.filter(c => c.status !== 'ok').map(c => `${c.id}: ${c.detail}`).join('; ')])]));
      for (const p of d.problems) print(`Problem: ${p}`); return d.health.some(h => h.status === 'blocked') ? 1 : 0; }

    case 'ledger': return withStore(async (entries, o) => {
      if (sub === 'head' || !sub) { const h = await o.store.head(); print(h ? `seq ${h.seq}\nhash ${h.hash}` : 'The ledger is empty.'); return 0; }
      if (sub === 'tail') { for (const e of entries.slice(-Number(a.flags.n ?? 10))) print(`${String(e.seq).padStart(6)}  ${when(e.ts)}  ${e.kind.padEnd(20)} ${e.actor.padEnd(10)} ${summary(e)}`); return 0; }
      if (sub === 'show') { const e = entries.find(x => x.seq === Number(arg)); if (!e) { print(`No entry with seq ${arg}.`); return 1; } print(JSON.stringify(e, null, 1)); return 0; }
      if (sub === 'verify' || sub === 'replay') { const r = verifyChain(entries);
        if (!r.ok) { print(`BROKEN at seq ${r.badSeq}: ${r.why}. Pull the cord and do not run until this is understood.`); return 3; }
        if (sub === 'replay') { const v = buildView(entries, cfg.paperCapital); print(`Replayed ${entries.length} entries: ${v.trials.size} trials, ${v.slots.size} slots, ${v.closed.length} closed trades, cash ${usd(v.cash)}.`); }
        print(`Chain is intact: ${entries.length} entries, head ${r.head ? r.head.hash.slice(0, 16) : 'none'}.`); return 0; }
      print(HELP); return 2; });

    case 'strategies': {
      if (sub === 'fingerprint') { const f = fingerprints(ctx), p = join(ctx.root, 'packages/engine/fingerprints.json');
        if (a.flags.write) { writeFileSync(p, JSON.stringify(f.now, null, 1) + '\n'); print(`Wrote ${Object.keys(f.now.strategies).length} fingerprints. Changes: ${f.diffs.length ? f.diffs.join('; ') : 'none'}.`); return 0; }
        if (!f.diffs.length) { print(`Fingerprints match: ${Object.keys(f.now.strategies).length} strategies, engine ${f.now.engine.slice(0, 12)}.`); return 0; }
        print(`Fingerprints differ from the committed file:\n${f.diffs.map(d => `  ${d}`).join('\n')}\nIf the change is intended, run with --write and commit the diff. A strategy that is locked in paper must not change: register a new id instead.`); return 1; }
      const f = fingerprints(ctx); print(table([['id', 'tf', 'direction', 'source', 'fingerprint', 'name'], ...STRATEGIES.map(s => [s.id, s.tf, s.direction, s.source, f.now.strategies[s.id].slice(0, 12), s.name])])); return 0;
    }

    case 'halt': { const reason = a._.slice(1).join(' ').trim(); if (!reason) { print('Say why: apex halt "<reason>"'); return 2; }
      return withStore(async (_e, o) => { const e = await new Ledger(o.store, ctx.now).append('halt', 'cli', { level: 'andon', by: 'cli', reason: reason.slice(0, 500) });
        print(`Andon cord pulled (ledger seq ${e.seq}). No new entries will be opened until it is resumed on the dashboard.`); return 0; }); }

    case 'live': return withStore(entries => { const v = buildView(entries, cfg.paperCapital), slots = [...v.slots.values()];
      print('Live trading is off. Going live needs all four locks, and the last three are Jeremy\'s alone.\n');
      if (!slots.length) print('No slot exists, so lock 1 (graduated in paper) is closed for everything.');
      for (const s of slots) { const tr = v.trials.get(s.trialKey), gradSeq = s.lastGrad?.state === 'strict_pass' ? s.lastGrad.seq : null, agree = tr?.validator.filter(x => x.purpose === 'graduation' && x.slotKey === s.slotKey && x.agrees).pop()?.seq ?? null;
        const r = liveAllowed(s.slotKey, { slotStatus: s.status, graduationPassedSeq: gradSeq, validatorAgreeSeq: agree, reviewClean: false, approval: null, machine: null }, ctx.now());   // the CLI never holds an approval or the machine key
        print(`${s.slotKey}: ${r.allowed ? 'all locks open' : 'closed'}`); for (const l of r.locks) print(`  ${l.open ? 'open  ' : 'closed'} ${l.id}: ${l.why}`); }
      print(`\nStages once live is allowed: ${STAGES.map(s => `${s.id} (${s.size * 100}% size)`).join(' -> ')}.`); return 0; });

    case 'doctor': return withStore(async (entries, o) => { const checks: [string, boolean, string][] = [], chain = verifyChain(entries), f = fingerprints(ctx), d = loadData(ctx);
      checks.push(['config', cfg.problems.length === 0, cfg.problems.join('; ') || 'ok'], ['ledger', chain.ok, chain.ok ? `${o.kind}, ${entries.length} entries, chain intact` : `broken at seq ${chain.badSeq}`],
        ['fingerprints', f.diffs.length === 0, f.diffs.join('; ') || `${Object.keys(f.now.strategies).length} strategies match`], ['data', d.health.every(h => h.status !== 'blocked') && !d.problems.length, `${d.datasets.length} datasets, ${d.health.filter(h => h.status === 'blocked').length} blocked, ${d.health.filter(h => !h.tradable).length} not tradable (stale data cannot open orders)`],
        ['gate', true, `standard-bar ${gateVersion(GATE_V1).slice(0, 12)}: ${passBar(GATE_V1)}`], ['telegram', !!(ctx.env.TELEGRAM_BOT_TOKEN && ctx.env.TELEGRAM_CHAT_ID), ctx.env.TELEGRAM_BOT_TOKEN && ctx.env.TELEGRAM_CHAT_ID ? 'configured' : 'not configured: reports are saved but not sent'],
        ['live', !ctx.env.APEX_ALLOW_LIVE && !ctx.env.ALPACA_LIVE, !ctx.env.APEX_ALLOW_LIVE && !ctx.env.ALPACA_LIVE ? 'off' : 'a live flag is set in this environment']);
      print(table([['check', 'ok', 'detail'], ...checks.map(c => [c[0], c[1] ? 'yes' : 'NO', c[2]])])); for (const w of cfg.warnings) print(`Warning: ${w}`);
      return checks.slice(0, 4).every(c => c[1]) ? 0 : 1; });

    default: print(`Unknown command: ${cmd}\n\n${HELP}`); return 2;
  }
}

function summary(e: { kind: string; payload: any }): string { const p = e.payload;
  switch (e.kind) { case 'trial_result': return `${p.strategy} ${p.symbol} ${p.tf}: ${p.status}`; case 'prereg': return `${p.strategy.id} on ${p.panel}`; case 'validator_run': return `${p.purpose} ${p.level}: ${p.agrees ? 'agrees' : 'DISAGREES'}`;
    case 'slot_locked': return `${p.slotKey} as ${p.role}`; case 'slot_status': return `${p.slotKey}: ${p.from} -> ${p.to}`; case 'intent': case 'intent_blocked': return `${p.slotKey} ${p.side === 1 ? 'long' : 'short'}`; case 'fill': return `${p.slotKey} ${p.kind} ${p.qty} at ${p.price}`;
    case 'halt': return `${p.level}: ${p.reason}`; case 'run': return `${p.id}: ${p.evaluated} evaluated, ${p.intents} intents`; case 'data_version': return `${p.dataset} ${p.status}`; default: return ''; } }
function validatorSummary(appends: { kind: string; payload: any }[]): string { const v = appends.filter(x => x.kind === 'validator_run').map(x => x.payload);
  return v.length ? ['Validator runs:', ...v.map(x => `- ${x.purpose} ${x.level} on ${x.slotKey ?? x.trialKey.slice(0, 12)}: ${x.agrees ? (x.exact ? 'agrees exactly' : 'agrees within tolerance') : `DISAGREES (${x.diffs.join('; ')})`}`)].join('\n') : 'Nothing was waiting for the validator.'; }

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(`apex: ${(e as Error).message}`); process.exit(1); });
