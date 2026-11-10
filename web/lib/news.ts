// Institutional-news digest from plain RSS (archive/chat/83). Our own code. Read-only: it fetches public feeds, tags each
// headline by who it is about (banks, hedge funds, CTAs, central banks, producers, options flow) and by market, and builds
// a short digest. It never trades and its tags are hints, not signals; nothing here has been tested for an edge.
export type NewsItem = { title: string; link: string; date: number; source: string; who: string[]; markets: string[] };

const WHO: Record<string, RegExp> = {
  banks: /\b(goldman|morgan stanley|jpmorgan|jp morgan|citi(group)?|bank of america|barclays|ubs|deutsche bank|hsbc|bnp)\b/i,
  hedge_funds: /\b(hedge funds?|citadel|millennium|bridgewater|point72|renaissance|elliott)\b/i,
  ctas: /\b(cta|ctas|trend[- ]followers?|systematic funds?|commodity trading advisors?)\b/i,
  central_banks: /\b(fed|fomc|powell|ecb|lagarde|boj|bank of japan|bank of england|boe|pboc|rate (cut|hike)s?)\b/i,
  producers: /\b(opec\+?|saudi aramco|producers?|miners?|shale|refiners?)\b/i,
  options_flow: /\b(options? (flow|volume|expiry|expiration)|gamma|open interest|0dte|put[- ]call|skew|vix)\b/i,
  positioning: /\b(cot report|commitments of traders|positioning|net long|net short|short interest|13f)\b/i,
};
const MKT: Record<string, RegExp> = {
  equities: /\b(s&p|spx|spy|nasdaq|dow|russell|stocks?|equit(y|ies))\b/i, rates: /\b(treasur(y|ies)|yields?|bonds?|10-year|2-year)\b/i,
  energy: /\b(oil|crude|brent|wti|natural gas|natgas|gasoline|diesel)\b/i, metals: /\b(gold|silver|copper|aluminum|platinum)\b/i,
  fx: /\b(dollar|euro|yen|sterling|pound|yuan|fx|currenc(y|ies))\b/i, crypto: /\b(bitcoin|btc|ether(eum)?|crypto|stablecoins?)\b/i,
  ags: /\b(wheat|corn|soy(beans?)?|cattle|hogs|coffee|sugar|cocoa)\b/i,
};
const tags = (t: string, m: Record<string, RegExp>) => Object.entries(m).filter(([, r]) => r.test(t)).map(([k]) => k);
const un = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** Parses RSS 2.0 <item> and Atom <entry> elements. */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const x = m[0], g = (tag: string) => un(x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
    const title = g('title'), link = g('link') || (x.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? ''), d = Date.parse(g('pubDate') || g('updated') || g('published'));
    if (!title) continue;
    const text = `${title} ${g('description') || g('summary')}`;
    out.push({ title, link, date: isNaN(d) ? 0 : d, source, who: tags(text, WHO), markets: tags(text, MKT) });
  }
  return out;
}

/** Keeps institution-related headlines, newest first, de-duplicated by title. */
export function digest(items: NewsItem[], o: { sinceMs?: number; max?: number } = {}) {
  const seen = new Set<string>(), keep = items.filter(i => i.who.length && (!o.sinceMs || i.date >= o.sinceMs))
    .sort((a, b) => b.date - a.date).filter(i => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, o.max ?? 40);
  const byWho: Record<string, number> = {}, byMkt: Record<string, number> = {};
  for (const i of keep) { i.who.forEach(w => (byWho[w] = (byWho[w] ?? 0) + 1)); i.markets.forEach(m => (byMkt[m] = (byMkt[m] ?? 0) + 1)); }
  return { items: keep, byWho, byMkt };
}

export function digestMarkdown(d: ReturnType<typeof digest>, day: string) {
  return [`# Institutional news digest, ${day}`, '', 'Headlines only, tagged by keyword. Tags are hints, not trade signals.', '',
    `Who: ${Object.entries(d.byWho).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Markets: ${Object.entries(d.byMkt).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`, '',
    ...d.items.map(i => `- [${i.title}](${i.link}) (${i.source}; ${[...i.who, ...i.markets].join(', ')})`)].join('\n');
}

/** Feed URLs come from APEX_NEWS_FEEDS (comma-separated) so nothing is hard-wired to one outlet. Server side only. */
export async function fetchDigest(feeds = (process.env.APEX_NEWS_FEEDS || '').split(',').map(s => s.trim()).filter(Boolean), sinceMs = Date.now() - 864e5) {
  const all: NewsItem[] = [];
  for (const url of feeds) { try { const r = await fetch(url, { headers: { 'user-agent': 'apex-news-digest' } }); if (r.ok) all.push(...parseFeed(await r.text(), new URL(url).hostname)); } catch { /* one bad feed never stops the rest */ } }
  return digest(all, { sinceMs });
}
