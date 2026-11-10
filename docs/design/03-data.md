# 03. Data platform

The study's main finding was that data, not ideas, is the binding constraint. This file specifies how Apex gets bars, proves where they came from, and refuses to trade on bad ones. Package: `packages/data`.

## 1. Concepts

| Term | Meaning |
|---|---|
| **Source** | A provider adapter: `massive`, `alpaca`, `tiingo`, `stooq`, `binance`, `kraken`, `fred`, `edgar`, `csv` (committed fixtures) |
| **Dataset** | One symbol, one timeframe, one source, one adjustment mode. Id: `<source>:<symbol>:<tf>:<adj>`, for example `massive:SPY:1h:split` |
| **Dataset version** | An immutable snapshot of a dataset's bars. Id is the SHA-256 of its canonical CSV. Stored once in the object store under `bars/<dataset id>/<hash>.csv.gz` |
| **Panel** | A named list of datasets that a test runs on, for example `us-etf-intraday` or `daily-long`. Panels are versioned |
| **Health** | The firewall's verdict on a dataset at a point in time: `ok`, `warn`, `blocked` |

A trial's input hash includes the dataset version hash, so a result can always be tied to the exact bars it used.

## 2. Bar schema

```ts
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }   // existing, t = bar open, ms UTC
type DatasetMeta = {
  id: string; source: string; symbol: string; tf: '5m'|'15m'|'30m'|'1h'|'4h'|'1d'|'1w';
  assetClass: 'stock'|'etf'|'crypto'|'fx'|'commodity'|'rate';
  adj: 'raw'|'split'|'total';            // total = split and dividend adjusted
  session: 'rth'|'eth'|'24x7';           // regular hours only, extended, or continuous
  tz: string;                            // exchange time zone, for session logic
  calendar: 'XNYS'|'CRYPTO'|'FX';
  first: number; last: number; rows: number; version: string;   // version = content hash
  fetchedAt: number; termsRef: string;   // pointer to the entry in data/SOURCES.md
}
```

Rules:
- Bars are always closed bars. The newest bar is dropped if its close time is in the future.
- Intraday stock bars are regular-hours only unless a strategy asks for extended hours. 4h bars for stocks are built from 1h regular-hours bars, anchored to the session open, and the builder is the only place that does it.
- Timestamps are UTC milliseconds at bar open. Session logic uses `tz` and `calendar`, never the server's zone.
- Adjustment mode is explicit. Intraday tests use `split`. Long daily tests use `total` and say so in the report.

## 3. Sources and what each is for

Nothing below is used until its terms have been read and recorded in `data/SOURCES.md` (provider, plan, what the terms allow, date checked, link). That file is the gate: an adapter refuses to fetch for a source with no entry.

| Need (plan Phase 2) | Primary | Second source for cross-check | Notes |
|---|---|---|---|
| Intraday US stocks and ETFs, 2 years | Massive (existing key) | Alpaca market data (free IEX feed; paper keys are enough) | Plan limits years, not symbols. Pool 20 to 50 liquid names |
| Long daily history, 10 to 20 years | Tiingo end-of-day (free key) if its terms fit personal research; otherwise Stooq bulk files | Alpaca daily (from 2016) and Massive daily for the overlap | The build thread reads the current terms first. Do not scrape sites whose terms forbid it |
| Crypto bars | Binance public (reachable from Vercel, not from the cloud container) | Kraken public | No keys |
| Order book and trades | `bots/orderbook-recorder` (Kraken public websocket, existing) on the worker box | none | Cannot be backfilled. Start it as soon as a machine is available |
| Macro series | FRED (existing) | none | Context only |
| Insider filings | SEC EDGAR with `SEC_USER_AGENT` | none | Generic contact only, never Jeremy's email. Respect the rate limit |
| Gamma exposure history | Only if a provider's terms allow storage and a price is acceptable | none | Open question for Jeremy; no free source is assumed |

**The product is different.** A paid product that runs tests on market data for customers needs a data licence that allows commercial use and display of derived results. That is a cost and a contract, covered in `12-saas-product.md` section 8. Personal-use data must not be reused there.

## 4. Adapter interface

```ts
interface SourceAdapter {
  id: string;
  capabilities(): { tfs: string[]; assetClasses: string[]; maxHistoryYears: number | null; adj: string[] };
  fetchBars(q: { symbol: string; tf: string; from: number; to: number; adj: string; session: string }): Promise<Bar[]>;
  rateLimit: { perMinute: number };
}
```

Adapters do one thing: fetch and normalise. They do not cache, validate or retry forever (three tries with backoff, then a `warn` health note). All network access for market data goes through adapters; a lint rule forbids `fetch` to market hosts elsewhere. `web/lib/market.ts` becomes a thin wrapper over this package.

## 5. Ingest and storage flow

```
schedule or `apex data pull`
  -> for each dataset in the registry: adapter.fetchBars(since last bar minus a 5-bar overlap)
  -> merge: overlap rows must match the stored rows exactly, otherwise write a `restated` health note and keep both versions
  -> firewall.check(dataset)  -> DataHealth row
  -> write new version to the object store (content addressed), update `datasets` row
  -> ledger entry `data_version { dataset, version, rows, first, last, health }`
```

Restatements matter: providers sometimes revise history. Apex never overwrites. A changed history is a new version, old trials keep pointing at the old one, and the report says a provider restated data.

The registry (`datasets` table plus `data/registry.json` for the committed default) lists which datasets exist and which panels they belong to. Adding a dataset is a green change; it does not by itself create trials until a run pairs it with strategies.

## 6. The data firewall (idea 6)

`firewall.check(bars, meta, opts) -> DataHealth`. Pure function. Runs on every pull and at the start of every autopilot run.

| Check | Rule | Severity |
|---|---|---|
| Schema | Finite numbers, `h >= max(o,c)`, `l <= min(o,c)`, `l > 0`, `v >= 0` | `blocked` on any violation in the last 500 bars, `warn` on older ones |
| Order and duplicates | Strictly increasing `t`, no duplicates | `blocked` |
| Staleness | Last closed bar older than 2 intervals of market time (calendar aware) | `blocked` for trading, evaluation still allowed |
| Gaps | Missing bars against the calendar: more than 1% of expected bars in the last 250 sessions | `warn` at 1%, `blocked` at 5% |
| Bad prints | A bar whose range or close-to-close return exceeds 10 times the rolling median absolute deviation (100 bars) and reverts by 80% within 2 bars | `warn`, and the bar is listed; `blocked` if it is in the last 5 bars |
| Unadjusted split | A close-to-close ratio within 1% of a common split ratio (2, 3, 4, 5, 10, 1/2, 1/3, 1/4, 1/5, 1/10 and so on) with no matching move in the second source | `blocked` |
| Flat or zero volume | 20 or more consecutive bars with zero volume on an asset that normally trades | `warn` |
| Second-source agreement | On the overlapping last 250 bars, median absolute close difference above 5 bp, or any single difference above 50 bp (daily) or 30 bp (intraday) | `warn` on the median rule, `blocked` when the last 5 bars disagree |
| Short history | Fewer bars than the gate needs for the 18-month holdout plus 50 trades at the strategy's typical frequency | `warn`; the evaluation result will be `needs_data` |

```ts
type DataHealth = {
  dataset: string; version: string; at: number; status: 'ok'|'warn'|'blocked';
  checks: { id: string; status: 'ok'|'warn'|'blocked'; detail: string; bars?: number[] }[];
  provenance: { source: string; second?: string; fetchedAt: number; adj: string; termsRef: string };
}
```

Effects:
- `blocked`: the guard refuses new entries on that symbol (rule `data-blocked`); the factory skips the pair and records `skipped_data` in the ledger, which is not a trial.
- `warn`: runs continue, the report and every screen showing that dataset carry a warning chip.
- Every report has a "Where the data came from" table built from `provenance`.

The thresholds live in `packages/data/src/firewall.config.ts` and are part of the gate version hash, so tightening or loosening them is visible in the ledger.

## 7. Caching

- Hot cache: Redis, keyed by dataset id and version, 15 minutes for intraday, 6 hours for daily (replaces the ad hoc `HUB` map in `market.ts`).
- Cold store: object store versions, never evicted.
- CI and tests use committed fixtures under `data/` only. Tests never touch the network.

## 8. Default panels

| Panel | Datasets | Used by |
|---|---|---|
| `us-etf-intraday` | SPY, QQQ, IWM at 30m, 1h, 4h (Massive, 2 years) | Phase 3 tests 1 to 5, current candidates |
| `us-liquid-pool` | 20 to 50 liquid stocks at 30m and 1h, pooled | Reaching 50 trades for intraday rules, test 6 |
| `daily-long` | SPY, QQQ, IWM, GLD, TLT, USO and the 11 sector ETFs, daily, 10 to 20 years, total-return adjusted | Test 7, diversified core benchmark |
| `fx-majors-daily` | The 28 crosses already used | Existing validations |
| `crypto-daily` | BTC, ETH daily | Existing validations |

Pooling rule: a pooled test concatenates trades across symbols but computes daily returns on the pooled equity curve, and the monkey test draws random entries per symbol. A pooled result is one trial, not one per symbol.

## 9. Benchmark: the diversified core

The honest benchmark from the plan is a diversified, risk-weighted hold. `packages/autopilot/src/benchmark.ts` builds it from `daily-long`: inverse-volatility weights (60-day), rebalanced monthly, 25% cap, costs charged at the cost model. Every report shows the paper book next to this benchmark and next to SPY buy and hold. A slot's "beats hold" check uses its own market's buy and hold; the book-level comparison uses the core.

## 10. Order-book recorder

Existing code stays. Additions: a daily manifest (file hashes, first and last timestamp, message count, reconnect count) posted to the dashboard through ingest, shown under Data health. Gaps are reported, never filled. Recordings are compressed and uploaded nightly if `APEX_STORAGE_URL` is set on the box.

## 11. Tests

- Firewall: one fixture per check, including a planted bad print, a planted 2-for-1 split and a stale feed.
- Merge: overlapping rows that differ produce a restatement, never an overwrite.
- 4h builder: session-anchored bars match a hand-built fixture across a daylight-saving change.
- Adapters: recorded responses only; schema drift in a provider response fails loudly.
- A property test: `fetch -> store -> load` returns identical bars and the same version hash.
