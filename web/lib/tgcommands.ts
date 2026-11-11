// Telegram commands (docs/design/07 s9). Read and safe actions only: the reads, a claim check, and a halt that needs a second
// tap. Every answer comes from the same v1 handlers the API and the screens use, so Telegram cannot disagree with them.
// There is no resume, approve, release, limit or live command here: each answers that it needs the dashboard.
// This file talks to nothing itself. The route passes in the API caller, a small store for the pending halt, and the clock.
import { createHash, randomBytes } from 'node:crypto';
import type { Responses, RouteId } from '@apex/sdk/contract';
import { based, bookText, fig, funnelText, header, share, when } from '@apex/sdk/text';

export type Call = <K extends RouteId>(id: K, a?: { params?: Record<string, string>; query?: Record<string, string | number | undefined>; body?: unknown }) => Promise<Responses[K]>;
export type Button = { text: string; data: string };
export type Reply = { text: string; buttons?: Button[] };
export type Io = { call: Call; origin: string; now: () => number;
  pending: { get: (k: string) => Promise<{ reason: string; ts: number } | null>; set: (k: string, v: { reason: string; ts: number } | null) => Promise<void> };
  /** The older bot commands (/positions, /orders, /pnl, /strategies, /bots) and the bots' own state line. */
  legacy?: (cmd: string) => Promise<string | null> };

export const HALT_WINDOW_MS = 120_000, MIN_CHECK_CHARS = 40;
export const COMMANDS = ['/state', '/report', '/board', '/slots', '/book', '/risk', '/data', '/queue', '/check', '/halt', '/help'] as const;
/** Things only the dashboard does, with a signed-in session. Telegram never does them. */
export const DASHBOARD_ONLY: Record<string, string> = { '/resume': '/autopilot/risk', '/release': '/', '/approve': '/autopilot/slots', '/live': '/autopilot/slots', '/retire': '/autopilot/slots', '/pause': '/autopilot/slots', '/limit': '/autopilot/risk', '/limits': '/autopilot/risk', '/key': '/you/setup', '/keys': '/you/setup' };
export const HELP = ['Apex on Telegram. Read and safe actions only.', '',
  '/state  mode, halts, tries counted, the funnel', '/report  the latest run', '/board  the ten best-placed pairs', '/slots  slots and their clocks', '/book  the paper book', '/risk  limits, halts, open risk',
  '/data  datasets with a problem', '/queue  this week\'s tries', '/check <text>  test the rules a text states (or send a text file with /check as its caption)', '/halt <reason>  stop new entries. Asks you to tap once more', '/help  this list',
  '', 'Resuming, approving and limits need the dashboard. Everything is paper unless you switched something live on your own machine.'].join('\n');
const FOOT = 'Paper. Past data is not a forward record.';
const fail = (e: unknown) => { const x = e as { code?: string; detail?: string; message?: string }; return x?.code ? `Apex said no (${x.code.replace(/_/g, ' ')}): ${x.detail ?? ''}`.trim() : `That did not work: ${String(x?.message ?? e).slice(0, 200)}`; };
const m = (x: Parameters<typeof fig>[0]) => x === null ? '-' : `${fig(x)} (${based(x)})`;

async function read(cmd: string, io: Io): Promise<string> {
  const { call, origin } = io;
  switch (cmd) {
    case '/state': { const s = await call('status'); const f = s.ledger === 'none' || s.ledger === 'error' ? null : await call('funnel').catch(() => null);
      return [header(s), ...s.halts.map(h => `Halt: ${h.level}, by ${h.by}: ${h.reason}`), s.lastRun ? `Last run ${s.lastRun.id} at ${when(s.lastRun.ts)}` : 'No run yet.', f ? funnelText(f) : 'No ledger can be read, so the tries are unknown, not zero.', await io.legacy?.('/state') ?? ''].filter(Boolean).join('\n'); }
    case '/report': { const r = (await call('reports', { query: { limit: 1 } })).items[0]; if (!r) return 'No run has been recorded yet.';
      return [`Run ${r.id} (${r.mode}) at ${when(r.ts)}`, `Evaluated ${r.evaluated}, new tries ${r.newTrials}, orders asked ${r.intents}, blocked ${r.blocked}, paper fills ${r.fills}, errors ${r.errors}.`,
        r.waitingBudget ? `${r.waitingBudget} pairs are waiting for next week's tries.` : '', ...r.problems.slice(0, 5).map(p => `Problem: ${p}`), `Full report: ${origin}/autopilot/reports/${encodeURIComponent(r.id)}`].filter(Boolean).join('\n'); }
    case '/board': { const b = await call('board', { query: { limit: 10 } }); if (!b.items.length) return 'Nothing has been evaluated yet.';
      return ['Results on past data, sorted by status, then checks passed, then Sharpe. Never by return.', '', ...b.items.map((r, i) => `${i + 1}. ${r.strategy} ${r.symbol} ${r.tf}: ${r.status.replace(/_/g, ' ')}, ${r.checksPassed}/${r.checks.length} checks, Sharpe ${m(r.metrics.sharpe)}, return ${fig(r.metrics.ret)}`),
        '', `The whole board: ${origin}/autopilot`, FOOT].join('\n'); }
    case '/slots': { const s = (await call('slots', { query: { limit: 50 } })).items.filter(x => x.status !== 'retired'); if (!s.length) return 'No slot is locked. Nothing has passed into paper yet.';
      return [...s.map(x => `${x.slotKey}: ${x.status.replace(/_/g, ' ')}, weight ${share(x.weight, 0)}, ${x.forwardTrades} forward trades, drift ${x.drift.cusum.toFixed(2)}, locked ${when(x.lockedAt)}${x.graduation.state ? `, last check ${x.graduation.state}` : ''}`), '', 'A slot in paper is being checked. It is not proven.', `${origin}/autopilot/slots`].join('\n'); }
    case '/book': return `${bookText(await call('book'))}\n${origin}/autopilot/book`;
    case '/risk': { const r = await call('risk'); const v = (k: string, x: number | null) => x === null ? 'none' : /^(maxOpen|maxPerSymbol|cooldownBars)$/.test(k) ? String(x) : share(x, x < 0.1 ? 1 : 0);
      return [`Halts: ${r.halts.length ? r.halts.map(h => `${h.level} (by ${h.by}: ${h.reason})`).join('; ') : 'none'}. Drawdown pause ${r.drawdownPaused ? 'ON' : 'off'}.`, `Open risk: ${share(r.openRiskPct, 2)} of paper equity.`, '', 'Limits in force (ceiling):',
        ...r.limits.map(l => `${l.key}: ${v(l.key, l.inForce)} (${v(l.key, l.ceiling)})${l.pending ? `, ${v(l.key, l.pending.value)} from ${when(l.pending.effective)}` : ''}`), '', 'Limits are set on the machine that runs the autopilot. They cannot be changed from here.', `${origin}/autopilot/risk`].join('\n'); }
    case '/data': { const d = (await call('dataHealth', { query: { limit: 200 } })).items; if (!d.length) return 'No run has checked the data yet.'; const bad = d.filter(x => x.status !== 'ok');
      return [`${d.length - bad.length} of ${d.length} datasets are ok.`, ...bad.slice(0, 15).map(x => `${x.dataset}: ${x.status}${x.tradable ? '' : ', not tradable'}, last bar ${when(x.last)}${x.warnings.length ? `. ${x.warnings.slice(0, 2).join('; ')}` : ''}`),
        bad.length > 15 ? `and ${bad.length - 15} more.` : '', bad.length ? 'Results on these are held until the data is refreshed: apex data pull, where the autopilot runs.' : '', `${origin}/autopilot/data`].filter(Boolean).join('\n'); }
    case '/queue': { const q = await call('queue');
      return [`Tries this week: ${q.used} of ${q.budget}${q.waiting ? `. ${q.waiting} pairs are waiting for budget` : ''}.`, ...q.items.slice(0, 10).map(i => `${i.label} (${i.source}): ${i.done} of ${i.pairs} done, ${i.passed} passed, ${i.nearMiss} near miss`), `${origin}/autopilot/queue`].join('\n'); }
  }
  return HELP;
}

/** Answer one command. `file` is the text of a document sent with /check as its caption. */
export async function command(textIn: string, io: Io, file?: string): Promise<Reply> {
  const text = textIn.trim(), cmd = text.split(/[\s@]/)[0].toLowerCase(), rest = text.replace(/^\/\w+(@\S+)?\s*/, '').trim();
  try {
    if (cmd === '/help' || cmd === '/start') return { text: HELP };
    if (cmd in DASHBOARD_ONLY) return { text: `That needs the dashboard, signed in: ${io.origin}${DASHBOARD_ONLY[cmd]}\nTelegram can read, check a claim and halt. It cannot resume, approve or change a limit.` };
    if (cmd === '/halt') {
      const reason = (rest || 'Halted from Telegram').slice(0, 300), id = randomBytes(8).toString('hex');
      await io.pending.set(id, { reason, ts: io.now() });
      return { text: `Halt Apex?\nReason: ${reason}\n\nNothing is halted yet. Tap "Halt now" within 2 minutes to stop new entries. Open positions are left as they are. Resuming needs the dashboard.`, buttons: [{ text: 'Halt now', data: `halt:${id}` }, { text: 'Cancel', data: `cancel:${id}` }] };
    }
    if (cmd === '/check') {
      const source = (file ?? rest).trim();
      if (source.length < MIN_CHECK_CHARS) return { text: 'Send the text to check after /check, or send a text file with /check as its caption. It needs the rules as the source states them, not only a title or a link.' };
      const q = await io.call('queue'); if (q.used >= q.budget) return { text: `Not checked: this week's tries are used up (${q.used} of ${q.budget}). Nothing was run.` };
      const a = await io.call('claimCheckStart', { body: { text: source, kind: 'transcript', idempotencyKey: `tg-${createHash('sha256').update(source).digest('hex').slice(0, 32)}` } });
      return { text: [a.headline, `Verdict: ${(a.verdict ?? 'none').replace(/_/g, ' ')}. Tries used by this check: ${a.trialsUsed}.${a.repeated ? ' Same text as an earlier check, so it was not run again.' : ''}`,
        'The verdict is about the rules on past data, not about the author.', `${io.origin}/claims/${encodeURIComponent(a.id)}`].join('\n') };
    }
    if ((COMMANDS as readonly string[]).includes(cmd)) return { text: await read(cmd, io) };
    const old = await io.legacy?.(text); return { text: old ?? HELP };
  } catch (e) { return { text: fail(e) }; }
}

/** The second tap. Only a fresh offer made by /halt can halt, and only once. */
export async function callback(data: string, io: Io): Promise<{ text: string; toast: string }> {
  const [kind, id] = data.split(':'), offer = /^[0-9a-f]{16}$/.test(id ?? '') ? await io.pending.get(id) : null;
  if (kind === 'cancel') { if (offer) await io.pending.set(id, null); return { text: 'Cancelled. Nothing was halted.', toast: 'Cancelled' }; }
  if (kind !== 'halt') return { text: 'That button is not one of Apex\'s.', toast: 'Unknown' };
  if (!offer || io.now() - offer.ts > HALT_WINDOW_MS) { if (offer) await io.pending.set(id, null); return { text: 'That offer has ended, so nothing was halted. Send /halt <reason> again and tap within 2 minutes.', toast: 'Too late' }; }
  await io.pending.set(id, null);
  try { const h = await io.call('halt', { body: { reason: offer.reason } });
    const led = h.ledger === 'recorded' ? 'The halt is in the ledger.' : h.ledger === 'already' ? 'The ledger already held a halt.' : h.ledger === 'no_ledger' ? 'No ledger is connected here, so also run apex halt where the autopilot runs.' : 'The halt could NOT be written to the ledger. Run apex halt where the autopilot runs as well.';
    return { text: `${h.already ? 'Apex was already halted.' : 'Halted.'} Every bot is told to pause. ${led}\nReason: ${offer.reason}\nResuming needs the dashboard, signed in: ${io.origin}/autopilot/risk`, toast: 'Halted' };
  } catch (e) { return { text: `NOT halted. ${fail(e)}\nUse the Halt button on the dashboard or apex halt in the terminal.`, toast: 'Not halted' }; }
}
