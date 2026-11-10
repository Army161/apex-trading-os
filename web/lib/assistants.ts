// Assistant bots from archive/chat/27: a morning brief, a Friday "Deal Seeker" scan and a Risk Mitigator chat.
// Market numbers come from exchange/Alpaca candles computed here; news, earnings and the economic calendar come from Claude's
// web search with sources. Nothing here trades.
import Anthropic from '@anthropic-ai/sdk';
import { candles } from './market';
import { rsi, sma, atr, Bar } from './engine/core';
import { push, list } from './store';
import { sendTelegram } from './telegram';
import { record, guard } from './usage';

export const MODEL = process.env.APEX_ASSISTANT_MODEL || 'claude-opus-5-5';
export const MIN_RR = Number(process.env.APEX_MIN_RR || 3);

/** One Claude call with web search; resumes server-side pauses; refusal fallbacks on. Returns text and source URLs. */
export async function research(system: string, prompt: string, maxUses = 8, maxTokens = 6000, feature = 'assistant') {
  await guard();
  const client = new Anthropic();
  const msgs: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  let r: Anthropic.Beta.BetaMessage | undefined;
  for (let i = 0; i < 4; i++) {
    r = await client.beta.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: msgs, output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses } as any], betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    await record(feature, MODEL, r.usage);
    if (r.stop_reason !== 'pause_turn') break;
    msgs.splice(1, msgs.length - 1, { role: 'assistant', content: r.content as any });
  }
  if (!r || r.stop_reason === 'refusal') throw new Error('the model declined');
  const text = r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('');
  const urls = new Set<string>();
  for (const b of r.content as any[]) for (const c of b.citations ?? []) if (c.url) urls.add(c.url);
  return { text, sources: [...urls].slice(0, 12) };
}

export async function broadcast(text: string) {
  const t = await sendTelegram(text);
  let d = false; const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook) { try { d = (await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1990) }) })).ok; } catch { /* keep going */ } }
  return { telegram: t, discord: d };
}

function snap(sym: string, b: Bar[]) {
  const c = b.map(x => x.c), i = c.length - 1, m20 = sma(c, 20)[i], m200 = sma(c, 200)[i];
  return { symbol: sym, close: c[i], chg1d: c[i] / c[i - 1] - 1, chg7d: c[i] / c[i - 7] - 1, rsi14: rsi(c, 14)[i], vsMA20: c[i] / m20 - 1, vsMA200: Number.isFinite(m200) ? c[i] / m200 - 1 : null, atrPct: atr(b, 14)[i] / c[i] };
}

export async function morningBrief() {
  const crypto = await Promise.all(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(async s => { try { return snap(s, (await candles(s, '1d', 260)).bars); } catch (e: any) { return { symbol: s, error: e.message }; } }));
  const today = new Date().toISOString().slice(0, 10);
  const { text, sources } = await research(
    'You write a pre-market brief for a retail trader in Arizona (US market opens 6:30am local). Plain, short, no hype, no predictions of price. ' +
    'Every fact must come from your searches or the numbers given; say "not found" rather than guess. End with the main downside risk today.',
    `Date ${today}. Crypto numbers computed from exchange candles (fractions, 0.01 = 1%): ${JSON.stringify(crypto)}.\n` +
    'Write the brief with these sections, each 2-5 bullet lines: 1) Gapping up / down pre-market (US stocks, % and the reason). ' +
    '2) Earnings today, before the open and after the close. 3) Economic reports today and this week, with times in ET, and anything released this morning. ' +
    '4) Market-moving news and policy headlines in the last 24h and why they matter. 5) What is moving Bitcoin today, in simple words, using the numbers above. ' +
    '6) Biggest downside risk today. Under 350 words, plain text suitable for Telegram (no tables, no markdown headings, use CAPS section labels).', 8, 6000, 'morning-brief');
  const brief = { ts: Date.now(), kind: 'brief', text, sources, crypto };
  await push('briefs', brief, 60);
  const sent = await broadcast(`APEX MORNING BRIEF ${today}\n\n${text}${sources.length ? `\n\nSources: ${sources.slice(0, 5).join(' ')}` : ''}`);
  return { ...brief, sent };
}

// Liquid, mostly high-quality US large caps plus crypto majors. Override with APEX_DEAL_UNIVERSE=AAPL,MSFT,...
const UNIVERSE = (process.env.APEX_DEAL_UNIVERSE || 'AAPL,MSFT,NVDA,AMZN,GOOGL,META,AVGO,TSLA,BRK.B,JPM,V,MA,UNH,LLY,JNJ,PG,HD,COST,WMT,KO,PEP,MRK,ABBV,ADBE,CRM,ORCL,AMD,INTC,QCOM,TXN,NKE,MCD,SBUX,DIS,NFLX,PYPL,BA,CAT,DE,GE,HON,UPS,LMT,XOM,CVX,PFE,TMO,ABT,DHR,LOW,TGT,BKNG,ISRG,NOW,INTU,AMAT,MU,LRCX,ASML,TSM,SHOP,UBER,ABNB,PANW,CRWD,SNOW,PLTR,SPY,QQQ,IWM').split(',');

async function alpacaWeekly(sym: string): Promise<Bar[]> {
  const key = process.env.ALPACA_API_KEY_ID, sec = process.env.ALPACA_API_SECRET_KEY; if (!key || !sec) throw new Error('no Alpaca keys');
  const start = new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10);
  const r = await fetch(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/bars?timeframe=1Week&start=${start}&limit=10000&adjustment=all&feed=iex`,
    { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec }, cache: 'no-store' });
  if (!r.ok) throw new Error(`alpaca ${r.status}`);
  const j = await r.json(); return (j.bars ?? []).map((x: any) => ({ t: Date.parse(x.t), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v }));
}

/** Oversold on the weekly chart: RSI(14) low, far below the 52-week high, but the long-term (200-week-ish) trend not broken. */
export function oversoldScore(b: Bar[]) {
  const c = b.map(x => x.c), i = c.length - 1; if (i < 60) return null;
  const r = rsi(c, 14)[i], hi = Math.max(...b.slice(-52).map(x => x.h)), off = c[i] / hi - 1, m = sma(c, Math.min(200, i))[i], m40 = sma(c, 40)[i];
  const score = Math.max(0, 50 - r) * 1.5 + Math.max(0, -off) * 100 + (c[i] > m ? 10 : -15) + (c[i] < m40 ? 5 : 0);
  return { rsiW: r, offHigh: off, aboveLongMA: c[i] > m, score };
}

export async function dealSeeker() {
  const rows: any[] = []; let source = 'alpaca weekly bars';
  const haveAlpaca = Boolean(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY);
  for (const s of haveAlpaca ? UNIVERSE : []) { try { const b = await alpacaWeekly(s); const o = oversoldScore(b); if (o) rows.push({ symbol: s, close: b[b.length - 1].c, ...o }); } catch { /* skip symbol */ } }
  for (const s of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'LINKUSDT', 'AVAXUSDT', 'DOGEUSDT']) {
    try { const b = (await candles(s, '1w', 300)).bars; const o = oversoldScore(b); if (o) rows.push({ symbol: s, close: b[b.length - 1].c, ...o }); } catch { /* skip */ }
  }
  if (!haveAlpaca) source = 'crypto only (add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to scan stocks)';
  const top25 = rows.sort((a, b) => b.score - a.score).slice(0, 25);
  const { text, sources } = await research(
    'You are Deal Seeker: you find good companies (or assets) that are oversold on the weekly chart. Quality first: profitable, solid balance sheet, ' +
    'durable business; an oversold junk name is not a deal. Use web search to check why each fell. No price predictions; say what would make each a bad idea.',
    `Weekly screen from ${source}. 25 most oversold (rsiW = weekly RSI14, offHigh = fraction below 52-week high, aboveLongMA = above ~200-week average):\n${JSON.stringify(top25)}\n\n` +
    'Pick the TOP 5 that look like quality on sale. For each: symbol, why it is down, why it may be quality, the key level that would prove you wrong, and one risk. ' +
    'Then one line on the rest. Plain text for Telegram, under 350 words.', 10, 7000, 'deal-seeker');
  const res = { ts: Date.now(), kind: 'deals', text, sources, screen: top25, source };
  await push('briefs', res, 60);
  const sent = await broadcast(`APEX DEAL SEEKER (weekly)\n\n${text}`);
  return { ...res, sent };
}

export const latestBriefs = (n = 10) => list<any>('briefs', n);

/** Risk Mitigator math, done in code so the ratio is never the model's guess. */
export function checkTrade(a: { side: 'long' | 'short'; entry: number; stop: number; target: number; equity?: number; risk_pct?: number }) {
  const eq = a.equity ?? 10000, rp = Math.min(a.risk_pct ?? 0.01, 0.02);
  const risk = a.side === 'long' ? a.entry - a.stop : a.stop - a.entry, reward = a.side === 'long' ? a.target - a.entry : a.entry - a.target;
  if (!(risk > 0)) return { ok: false, problem: 'the stop is on the wrong side of the entry' };
  if (!(reward > 0)) return { ok: false, problem: 'the target is on the wrong side of the entry' };
  const rr = reward / risk, need = a.side === 'short' ? MIN_RR + 0.5 : MIN_RR, qty = Math.min((eq * rp) / risk, eq / a.entry);
  return { ok: rr >= need, rr: +rr.toFixed(2), required_rr: need, risk_pct_of_price: +(risk / a.entry * 100).toFixed(2), reward_pct_of_price: +(reward / a.entry * 100).toFixed(2),
    size: { qty: +qty.toPrecision(4), notional: +(qty * a.entry).toFixed(2), max_loss: +(qty * risk).toFixed(2), equity: eq, risk_pct: rp },
    note: a.side === 'short' ? 'Shorts need a higher bar here: losses are open-ended, squeezes are fast, and borrow costs add up.' : undefined };
}

// Investor lenses (archive/chat/26 and chat/30): one symbol seen through four classic styles side by side, so you can see
// where they agree and disagree. Prompts are written in the spirit of each style's public writing, not the real people.
export const LENSES = [
  ['Deep value (Graham-style)', 'price versus book and earnings, balance-sheet safety, margin of safety'],
  ['Quality (Buffett-style)', 'durable moat, owner earnings, management, pricing power; wonderful business at a fair price?'],
  ['Growth at a fair price (Lynch-style)', 'is the growth story simple, early and accelerating, and is the price fair for it (PEG)?'],
  ['Inversion (Munger-style)', 'list how this loses money first: incentives, leverage, dilution, competition'],
] as const;

export async function investorLenses(symbol: string) {
  const sym = symbol.toUpperCase().trim(); let numbers: any = null;
  if (/USDT$/.test(sym)) { try { numbers = snap(sym, (await candles(sym, '1d', 260)).bars); } catch { /* numbers stay null */ } }
  const { text, sources } = await research(
    'You compare investor styles on one asset for a retail trader. Each lens is a style, not the real person, and never claims to be their view. ' +
    'Facts only from your searches or the numbers given; say "not found" rather than guess. No price predictions. For crypto, say plainly where a lens built for companies does not fit.',
    `Asset: ${sym}.${numbers ? ` Numbers from exchange candles (fractions): ${JSON.stringify(numbers)}.` : ''}\n` +
    `Give each lens a verdict (likes it / neutral / avoids it), a score 0-100, two short reasons and its biggest worry:\n${LENSES.map(([n, d]) => `- ${n}: ${d}`).join('\n')}\n` +
    'Then: WHERE THEY AGREE (one line), WHERE THEY DISAGREE (one line), and WHAT WOULD CHANGE THE PICTURE (one line). Plain text, CAPS labels, under 300 words.', 6, 5000, 'lenses');
  const res = { ts: Date.now(), kind: 'lenses', symbol: sym, text, sources };
  await push('briefs', res, 60);
  return res;
}

// Macro panel (archive/chat/30): a few FRED series when FRED_API_KEY is set (free key at fred.stlouisfed.org).
const FRED = [['FEDFUNDS', 'Fed funds rate %'], ['DGS10', '10-year Treasury %'], ['DGS2', '2-year Treasury %'], ['T10Y2Y', '10y minus 2y spread'],
  ['CPIAUCSL', 'CPI index (YoY computed)'], ['UNRATE', 'Unemployment %'], ['DTWEXBGS', 'Broad US dollar index'], ['VIXCLS', 'VIX']] as const;
export async function macro() {
  const key = process.env.FRED_API_KEY; if (!key) return { ok: false, note: 'Add FRED_API_KEY (free from fred.stlouisfed.org) to see macro data.', series: [] };
  const series = await Promise.all(FRED.map(async ([id, label]) => {
    try {
      const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${id === 'CPIAUCSL' ? 13 : 30}`, { next: { revalidate: 3600 } } as any);
      const obs = ((await r.json()).observations ?? []).filter((o: any) => o.value !== '.').map((o: any) => ({ date: o.date, v: Number(o.value) }));
      if (!obs.length) return { id, label, error: 'no data' };
      const value = id === 'CPIAUCSL' && obs.length >= 13 ? (obs[0].v / obs[12].v - 1) * 100 : obs[0].v;
      const prev = id === 'CPIAUCSL' ? null : obs[Math.min(obs.length - 1, 20)]?.v ?? null;
      return { id, label: id === 'CPIAUCSL' ? 'CPI inflation, YoY %' : label, date: obs[0].date, value: +value.toFixed(2), change: prev == null ? null : +(obs[0].v - prev).toFixed(2) };
    } catch (e: any) { return { id, label, error: e.message }; }
  }));
  return { ok: true, series };
}

// Crowd check (idea from archive/chat/32, last30days): what real people are saying over the last 30 days on Reddit, X,
// YouTube and Hacker News, plus Polymarket odds on related events. Crowd opinion is labelled as opinion, and one-sided
// euphoria or panic is called out as a contrarian warning rather than a signal to follow.
export async function crowdCheck(topic: string) {
  const t = topic.trim().slice(0, 80);
  const { text, sources } = await research(
    'You run a social sentiment sweep for a cautious retail trader. Search Reddit, X, YouTube, Hacker News and Polymarket for the last 30 days. ' +
    'Report what people actually say, with the platform for each point. Crowd opinion is not fact: never present it as one. No price predictions. ' +
    'If the mood is one-sided (euphoria or panic), say so plainly as a contrarian warning.',
    `Topic: ${t}. Give: MOOD (one word plus a 0-100 crowd bullishness number and how sure you are), RISING (what is gaining attention), ` +
    'BULL CASE PEOPLE MAKE, BEAR CASE PEOPLE MAKE, POLYMARKET (any related markets with current odds, or "none found"), ' +
    'OVERHYPED OR IGNORED (one line), CONTRARIAN WARNING (yes/no and why). Plain text, CAPS labels, under 280 words.', 8, 5000, 'crowd');
  const res = { ts: Date.now(), kind: 'crowd', symbol: t, text, sources };
  await push('briefs', res, 60);
  return res;
}
