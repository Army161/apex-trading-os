// Order-book recorder (archive/chat/77): saves the best bid/ask and public trades from an exchange websocket to JSONL,
// because order-book history usually can't be downloaded later. Read-only public data. No keys, no order endpoints.
// Run: node record.mjs [SYMBOL]   e.g. node record.mjs BTC/USD   (Node 22+, uses the built-in WebSocket)
import { appendFileSync, mkdirSync } from 'node:fs';

export const KRAKEN_WS = 'wss://ws.kraken.com/v2';

/** Turn one Kraken v2 message into rows: quotes {t,bid,ask} and prints {t,price,side,qty}. Unknown messages give []. */
export function parseKraken(msg) {
  const out = [];
  if (msg?.channel === 'ticker' && Array.isArray(msg.data))
    for (const d of msg.data) out.push({ kind: 'quote', sym: d.symbol, t: Date.now(), bid: +d.bid, ask: +d.ask });
  if (msg?.channel === 'trade' && Array.isArray(msg.data))
    for (const d of msg.data) out.push({ kind: 'print', sym: d.symbol, t: Date.parse(d.timestamp), price: +d.price, qty: +d.qty, side: d.side });
  return out;
}

if (process.argv[1]?.endsWith('record.mjs')) {
  const sym = process.argv[2] ?? 'BTC/USD', dir = process.env.RECORD_DIR ?? 'recordings';
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${sym.replace('/', '-')}-${new Date().toISOString().slice(0, 10)}.jsonl`;
  const connect = (wait = 1000) => {
    const ws = new WebSocket(KRAKEN_WS);
    ws.onopen = () => { wait = 1000; for (const channel of ['ticker', 'trade']) ws.send(JSON.stringify({ method: 'subscribe', params: { channel, symbol: [sym] } })); console.log('recording', sym, '->', file); };
    ws.onmessage = ev => { const rows = parseKraken(JSON.parse(ev.data)); if (rows.length) appendFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); };
    ws.onclose = () => { console.log(`closed, reconnecting in ${wait / 1000}s (a gap is logged as missing data)`); setTimeout(() => connect(Math.min(wait * 2, 60000)), wait); };
    ws.onerror = () => ws.close();
  };
  connect();
}
