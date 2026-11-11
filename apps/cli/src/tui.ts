// The full-screen view (docs/design/08 s5). It is drawn with plain terminal escape codes and has no dependency: `frame` is a
// pure function from data and state to the text of one screen, `press` is a pure function from a key to the next state, and
// `runTui` is the thin loop around them. It reads through the same Source as every other command and refreshes every 30
// seconds. The only thing it can change is the halt, and that asks for a reason and a typed confirmation first.
import type { Book, DataHealth, Evaluation, LedgerRow, Queue, Risk, Slot, Status } from '@apex/sdk';
import { SourceError, all, type Source } from './source';
import * as R from './render';

export const PANES = ['Today', 'Board', 'Slots', 'Book', 'Risk', 'Queue', 'Data', 'Ledger'] as const;
export type TuiData = { status: Status; slots: Slot[]; book: Book | null; board: Evaluation[]; risk: Risk | null; queue: Queue | null; data: DataHealth[]; ledger: LedgerRow[]; where: string; error: string | null };
export type TuiState = { pane: number; row: number; filter: string; mode: 'view' | 'filter' | 'reason' | 'confirm' | 'help' | 'detail'; input: string; detail: string[]; note: string };
export const START: TuiState = { pane: 0, row: 0, filter: '', mode: 'view', input: '', detail: [], note: '' };
export type Action = { do: 'quit' } | { do: 'refresh' } | { do: 'halt'; reason: string } | { do: 'open'; pane: number; id: string } | null;

export async function load(s: Source): Promise<TuiData> {
  const status = await s.call('status'), has = status.ledger === 'postgres' || status.ledger === 'file', where = `${s.mode}: ${s.where}`;
  if (!has) return { status, slots: [], book: null, board: [], risk: null, queue: null, data: [], ledger: [], where, error: 'No ledger can be read here yet.' };
  const [slots, book, board, risk, queue, data, ledger] = await Promise.all([all<Slot>(s, 'slots'), s.call('book'), all<Evaluation>(s, 'board', {}, 400), s.call('risk'), s.call('queue'), all<DataHealth>(s, 'dataHealth'), s.call('ledger', { query: { limit: 100 } })]);
  return { status, slots, book, board, risk, queue, data, ledger: ledger.items, where, error: null };
}

/** A pane is a fixed top, rows that can be picked, and the id each row opens. */
type Pane = { top: string[]; rows: string[]; ids: string[] };
const split = (text: string, ids: string[], head = 1): Pane => { const l = text.split('\n'); return ids.length ? { top: l.slice(0, head), rows: l.slice(head, head + ids.length), ids } : { top: [], rows: l, ids: [] }; };
const lines = (text: string): Pane => ({ top: [], rows: text.split('\n'), ids: [] });
export function pane(d: TuiData, i: number): Pane {
  if (d.error && i > 0) return lines(d.error);
  switch (PANES[i]) {
    case 'Today': return lines(R.statusText(d.status, d.slots, d.book).split('\n').slice(1).join('\n'));
    case 'Board': return d.board.length ? split(R.boardText(d.board, d.board.length).split('\n').slice(2).join('\n'), d.board.map(r => r.trialKey)) : lines('No pair has been evaluated yet.');
    case 'Slots': return split(R.slotsText(d.slots), d.slots.map(s => s.slotKey));
    case 'Book': return lines(d.book ? R.bookText(d.book) : 'No book yet.');
    case 'Risk': return lines(d.risk ? R.riskText(d.risk) : 'No limits to show yet.');
    case 'Queue': return lines(d.queue ? R.queueText(d.queue) : 'Nothing is queued.');
    case 'Data': return lines(R.dataText(d.data));
    case 'Ledger': return split(R.ledgerRows(d.ledger), d.ledger.map(e => String(e.seq)), 0);
  }
}
const shown = (p: Pane, filter: string) => { const f = filter.toLowerCase(), keep = p.rows.map((_, i) => i).filter(i => !f || p.rows[i].toLowerCase().includes(f)); return { rows: keep.map(i => p.rows[i]), ids: p.ids.length ? keep.map(i => p.ids[i]) : [] }; };

const HELP_LINES = ['1 to 8    switch pane', 'up, down  move (also k and j)', 'enter     open the row in detail (Board, Slots, Ledger)', '/         filter the rows of this pane; Esc clears it', 'r         refresh now (it refreshes itself every 30 seconds)',
  'H         halt: type a reason, then type HALT to confirm', 'Esc       close this, or the detail', 'q         quit', '', 'This view only reads. The one thing it can change is the halt.', 'There is no resume here: resuming is Jeremy\'s, on the dashboard.'];
const KEYS = 'up/down move   enter open   / filter   r refresh   H halt   ? help   q quit';

/** One screen as text: `rows` lines, each exactly `cols` wide. */
export function frame(d: TuiData, st: TuiState, cols: number, rows: number): string {
  const w = Math.max(40, cols), h = Math.max(12, rows), inner = w - 4, fit = (s: string) => (s.length > inner ? s.slice(0, inner - 1) + '…' : s.padEnd(inner)), line = (s: string) => `│ ${fit(s)} │`;
  const rule = (l: string, r: string, title = '', right = '') => { const mid = w - 2 - title.length - right.length; return `${l}${title}${'─'.repeat(Math.max(0, mid))}${right}${r}`.slice(0, w - 1).padEnd(w - 1, '─') + r; };
  const head = R.header(d.status).split(' · ').join(' ─ ');
  const out = [rule('┌', '┐', ` APEX ─ ${head} `, ` ${d.status.at.slice(11, 16)} UTC `)];
  const tabs = PANES.map((p, i) => (i === st.pane ? `[${i + 1}] ${p.toUpperCase()}` : ` ${i + 1}  ${p}`)).join('  ');
  if (tabs.length <= inner) out.push(line(tabs)); else { out.push(line(PANES.map((_, i) => (i === st.pane ? `[${i + 1}]` : ` ${i + 1} `)).join(' '))); out.push(line(`Pane: ${PANES[st.pane]}`)); }   // narrow terminal: numbers, then the name on its own line
  out.push(rule('├', '┤'));
  const room = h - out.length - 3, body: string[] = [];
  if (st.mode === 'help') body.push(...HELP_LINES);
  else if (st.mode === 'detail') body.push(...st.detail);
  else { const p = pane(d, st.pane), v = shown(p, st.filter), space = Math.max(1, room - p.top.length - (st.filter ? 1 : 0)), at = Math.min(st.row, Math.max(0, v.rows.length - 1)), from = Math.max(0, Math.min(at - space + 1, v.rows.length - space) < 0 ? 0 : Math.max(0, at - space + 1));
    if (st.filter) body.push(`Filter: ${st.filter}   (${v.rows.length} of ${p.rows.length} rows)`);
    body.push(...p.top.map(t => (p.ids.length ? `  ${t}` : t)));
    body.push(...(v.rows.length ? v.rows.slice(from, from + space).map((r, i) => (p.ids.length ? `${from + i === at ? '> ' : '  '}${r}` : r)) : ['Nothing matches the filter.'])); }
  const scroll = st.mode === 'detail' || st.mode === 'help' ? Math.min(st.row, Math.max(0, body.length - room)) : 0;
  for (let i = 0; i < room; i++) out.push(line(body[scroll + i] ?? ''));
  out.push(rule('├', '┤'));
  out.push(line(st.mode === 'filter' ? `Filter: ${st.input}_   (Enter keeps it, Esc clears it)` : st.mode === 'reason' ? `Halt. Why? ${st.input}_   (Enter to go on, Esc to cancel)` : st.mode === 'confirm' ? `Pull the cord for "${st.input}"? Type HALT and Enter: ${st.note}_`
    : st.mode === 'detail' || st.mode === 'help' ? 'up/down scroll   Esc back   q quit' : st.note ? `${st.note}` : KEYS));
  out.push(rule('└', '┘', '', ` ${d.where.slice(0, Math.max(0, w - 8))} `));
  return out.join('\n');
}

/** What a key does. Keys are named: a single character, or up, down, enter, esc, backspace. */
export function press(st: TuiState, key: string, d: TuiData): { state: TuiState; action: Action } {
  const stay = (s: Partial<TuiState>, action: Action = null) => ({ state: { ...st, ...s }, action }), typed = key.length === 1 && key >= ' ';
  if (st.mode === 'filter') return key === 'enter' ? stay({ mode: 'view', filter: st.input, input: '', row: 0 }) : key === 'esc' ? stay({ mode: 'view', filter: '', input: '', row: 0 }) : key === 'backspace' ? stay({ input: st.input.slice(0, -1) }) : typed ? stay({ input: (st.input + key).slice(0, 60) }) : stay({});
  if (st.mode === 'reason') return key === 'enter' ? (st.input.trim() ? stay({ mode: 'confirm', note: '' }) : stay({})) : key === 'esc' ? stay({ mode: 'view', input: '', note: 'Halt cancelled.' }) : key === 'backspace' ? stay({ input: st.input.slice(0, -1) }) : typed ? stay({ input: (st.input + key).slice(0, 200) }) : stay({});
  // `note` holds what has been typed at the confirmation. Only the exact word pulls the cord.
  if (st.mode === 'confirm') return key === 'enter' ? (st.note === 'HALT' ? stay({ mode: 'view', input: '', note: 'Pulling the cord…' }, { do: 'halt', reason: st.input.trim() }) : stay({ mode: 'view', input: '', note: 'Not halted: the word typed was not HALT.' })) : key === 'esc' ? stay({ mode: 'view', input: '', note: 'Halt cancelled.' })
    : key === 'backspace' ? stay({ note: st.note.slice(0, -1) }) : typed ? stay({ note: (st.note + key).slice(0, 8) }) : stay({});
  if (st.mode === 'help' || st.mode === 'detail') return key === 'q' ? stay({}, { do: 'quit' }) : key === 'esc' || key === 'enter' ? stay({ mode: 'view', detail: [], row: 0 }) : key === 'down' || key === 'j' ? stay({ row: st.row + 1 }) : key === 'up' || key === 'k' ? stay({ row: Math.max(0, st.row - 1) }) : stay({});
  const v = shown(pane(d, st.pane), st.filter), last = Math.max(0, v.rows.length - 1);
  if (/^[1-9]$/.test(key) && Number(key) <= PANES.length) return stay({ pane: Number(key) - 1, row: 0, filter: '', note: '' });
  switch (key) {
    case 'q': return stay({}, { do: 'quit' });
    case 'r': return stay({ note: '' }, { do: 'refresh' });
    case '?': return stay({ mode: 'help', row: 0 });
    case '/': return stay({ mode: 'filter', input: st.filter, note: '' });
    case 'H': return stay({ mode: 'reason', input: '', note: '' });
    case 'esc': return stay({ filter: '', row: 0, note: '' });
    case 'down': case 'j': return stay({ row: Math.min(last, st.row + 1), note: '' });
    case 'up': case 'k': return stay({ row: Math.max(0, st.row - 1), note: '' });
    case 'enter': { const id = v.ids[Math.min(st.row, last)]; return id ? stay({ note: '' }, { do: 'open', pane: st.pane, id }) : stay({}); }
    default: return stay({});
  }
}

/** The text a row opens. */
export async function detailOf(s: Source, paneIndex: number, id: string): Promise<string[]> {
  try { const p = PANES[paneIndex];
    return (p === 'Board' ? R.pairText(await s.call('pair', { params: { trialKey: id } })) : p === 'Slots' ? R.slotText(await s.call('slot', { params: { key: id } })) : R.ledgerEntryText(await s.call('ledgerEntry', { params: { seq: id } }))).split('\n');
  } catch (e) { return [`Could not open it: ${e instanceof SourceError ? e.message : 'the ledger could not be read'}`]; }
}

const NAMES: Record<string, string> = { '\x1b[A': 'up', '\x1b[B': 'down', '\x1bOA': 'up', '\x1bOB': 'down', '\r': 'enter', '\n': 'enter', '\x7f': 'backspace', '\b': 'backspace', '\x1b': 'esc' };
export type TuiOpts = { now: () => number; once?: boolean; cols?: number; rows?: number; print: (s: string) => void; halt: (reason: string) => Promise<string> };

export async function runTui(s: Source, o: TuiOpts): Promise<number> {
  let data = await load(s), st = START;
  const tty = !!process.stdout.isTTY && !!process.stdin.isTTY;
  // Without a real terminal (a pipe, a test, --once) there is nothing to drive: print one screen and stop.
  if (o.once || !tty) { o.print(frame(data, st, o.cols ?? 100, o.rows ?? 30)); return 0; }
  const out = process.stdout, inp = process.stdin, draw = () => out.write(`\x1b[H${frame(data, st, o.cols ?? out.columns ?? 100, o.rows ?? out.rows ?? 30).split('\n').map(l => `${l}\x1b[K`).join('\n')}\x1b[J`);
  const refresh = async () => { try { data = await load(s); } catch (e) { st = { ...st, note: `Refresh failed: ${e instanceof SourceError ? e.message : 'the source could not be read'}` }; } draw(); };
  return new Promise<number>(done => {
    const timer = setInterval(refresh, 30_000);
    const stop = (code: number) => { clearInterval(timer); inp.setRawMode(false); inp.pause(); inp.off('data', onKey); out.off('resize', draw); out.write('\x1b[?25h\x1b[?1049l'); done(code); };
    let busy = false;
    const onKey = async (buf: Buffer) => { const raw = buf.toString('utf8'); if (raw === '\x03') return stop(0); if (busy) return;
      const r = press(st, NAMES[raw] ?? raw, data); st = r.state; draw(); if (!r.action) return;
      if (r.action.do === 'quit') return stop(0);
      busy = true;
      try { if (r.action.do === 'refresh') await refresh();
        else if (r.action.do === 'open') { st = { ...st, mode: 'detail', row: 0, detail: await detailOf(s, r.action.pane, r.action.id) }; }
        else if (r.action.do === 'halt') { try { st = { ...st, note: await o.halt(r.action.reason) }; } catch (e) { st = { ...st, note: `Not halted: ${(e as Error).message}` }; } await refresh(); }
      } finally { busy = false; draw(); } };
    out.write('\x1b[?1049h\x1b[?25l'); inp.setRawMode(true); inp.resume(); inp.on('data', onKey); out.on('resize', draw); draw();
  });
}
