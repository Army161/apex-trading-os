# web/lib

The dashboard's server code: the strategy engine (`engine/`), the agent policy gateway (`policy.ts`), the model gateway (`gateway.ts`) and router (`router.ts`), memory, usage and the store.

The app shell reads the autopilot ledger through `ledger.ts` (Postgres, or the file ledger in local development). `status.ts` turns it into what the header shows, `queries.ts` holds the query functions the screens and the API share, and `nav.ts` with `routes.json` is the one list of screens.

`api/` serves `/api/v1` from the contract in `packages/sdk`: `serve.ts` is the one door (route, caller, scope, limit, body, ledger, answer), what each route returns lives in `packages/api` (`handlers.ts`, `queries.ts` and `status.ts` here are one-line re-exports of it, so the terminal uses the very same code), `deps.ts` wires `serve` to the real key store, ledger and the two writes, and `keys.ts` holds the API keys. `app/api/mcp` is the MCP server over HTTP: it needs an API key, and each tool call goes through the v1 client into `serve` with that key.

## Invariants
These must always stay true. `python3 tools/drift_check.py` checks them.
- `policy.ts` refuses order, withdraw, transfer and pay for every agent, through the `no-money-tools` hard rule that no config can remove.
- Send, sign and delete wait for Jeremy's yes. New agents start on "ask".
- `gateway.ts` is the only file that calls a model provider.
- Secrets are redacted before anything is logged or stored (`redact()` in `policy.ts`, `looksSecret` in `memory.ts`).
- A strategy only counts as having an edge if it passes `engine/validate.ts`: 50 or more trades, beats 95% of random traders, makes money on locked test data, and survives fees.
- Going live with a strategy needs the second-opinion review (`review.ts`) and Jeremy's own switch.
- Every screen shows the mode badge and Halt. The shell can send one thing, a halt. It has no resume, approve or go-live control.
- A ledger halt is released only from the Risk screen, through `app/api/resume/`: signed in, same origin, a reason, and the phrase typed out. That route is a red path and can release a paper halt and nothing else.
- An Autopilot screen draws only what `queries.ts` returns from the ledger. The board is never sorted by return. Report text is parsed into data by `markdown.ts` and never set as HTML.
- The count of tries is read from the ledger. With no ledger connected it is shown as unknown, never as zero. A ledger that cannot be read is shown as halted.
- A claim check from the dashboard goes through `claimrun.ts`: the plan step writes nothing and returns no result, and the run step re-checks the extraction against the source, takes the run lock and records through the ledger. The source text is never stored.
- A screen is added to `routes.json`, and `npm run check:ui` opens every screen in that list.
- The installed app (`app/manifest.ts`, `public/sw.js`, `public/offline.html`): the service worker answers and stores GET requests only. A write is never stored and never queued. No `/api/` answer and no You screen is stored. A stored screen is shown only when the server cannot be reached, for 24 hours at most, with the offline notice, and every control in it is off.
- A manifest shortcut is a link to a screen. Opening one never halts or changes anything. The share target only fills the box on New claim check.
- The app never asks to be installed by itself, and it sends no web push. Alerts stay on Telegram.
- A bot's dashboard command (`bots.ts`) is handed out only on that bot's own poll of `app/api/bots/[id]/command`, and on every poll until that bot acknowledges it by its ref (ingest token) or a newer command replaces it. `/api/ingest` never reads the queue. The poll answers `halted`, which stays true after a pause or kill is acknowledged, and while the kill switch or andon cord is on it answers pause with no ref.
- Telegram (`tgcommands.ts`, `app/api/telegram`): read and safe actions only. Every Apex command answers from the v1 handlers. The only writes it can reach are a claim check and a halt, and a halt needs a second tap on a button within two minutes, once. `/resume`, `/release`, `/approve`, `/live` and `/limit` answer that they need the dashboard. The webhook checks Telegram's secret header first and answers one chat only.
- Every `/api/v1` call goes through `api/serve.ts`. A route exists only if it is in the contract and has a handler; a test fails when the two lists differ, and another when any answer does not fit its schema.
- v1 can read, start a claim check and pull the halt. It cannot release a halt, approve, change a limit or make a key, and the handlers in `packages/api` reach the outside only through what they are handed.
- `/api/mcp` answers nothing without a known API key, not even the list of tools. It reaches Apex only by calling `serve` with the caller's key, so scopes, limits, the halt and the budget apply to an MCP tool call exactly as to an API call. It is stateless and answers POST only.
- An API key is stored as a hash with a pepper, shown once, and holds only scopes from the contract. With no pepper set, no key works in production. Keys are made and revoked only from a signed-in dashboard session (`app/api/admin/keys/`, a red path).
- The dashboard session works on v1 reads from the dashboard itself, and on no v1 write.
