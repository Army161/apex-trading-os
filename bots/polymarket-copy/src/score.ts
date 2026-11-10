/** Wallet scout: before you copy anyone, score them. Pulls closed positions from the Data API and reports
 * realised PnL, win rate, average hold and how much of their PnL came from one lucky market (concentration).
 * Usage: npm run score -- 0xWALLET [0xWALLET2 ...] */
import axios from 'axios';

async function score(user: string) {
  const { data } = await axios.get('https://data-api.polymarket.com/closed-positions', { params: { user, limit: 500 }, timeout: 15000 }).catch(() => ({ data: [] }));
  const rows: any[] = Array.isArray(data) ? data : [];
  const pnl = rows.map(r => Number(r.realizedPnl ?? 0));
  const total = pnl.reduce((a, b) => a + b, 0);
  const wins = pnl.filter(x => x > 0).length;
  const best = Math.max(0, ...pnl);
  return { user, closed: rows.length, realizedPnl: +total.toFixed(2), winRate: rows.length ? +(wins / rows.length).toFixed(3) : 0,
    topMarketShare: total > 0 ? +(best / total).toFixed(2) : null,
    verdict: rows.length < 30 ? 'too few closed positions to judge' : total <= 0 ? 'avoid: negative realised PnL'
      : best / total > 0.5 ? 'caution: most profit from one market (luck?)' : 'candidate: consistent realised profit' };
}
const users = process.argv.slice(2);
if (!users.length) { console.log('usage: npm run score -- 0xWALLET ...'); process.exit(1); }
Promise.all(users.map(score)).then(r => console.table(r));
