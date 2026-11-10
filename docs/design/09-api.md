# 09. REST API v1

A read-and-queue API over the same query functions the dashboard uses. It feeds the terminal (remote mode), the MCP server, the browser extension and, in a separate deployment, the product. Base path: `/api/v1`. Routes live in `web/app/api/v1/`. A machine-readable contract (`docs/design/openapi.yaml`, OpenAPI 3.1) is written from this file in Phase 4 and checked in CI against the route registry.

## 1. Rules

1. **No trade routes.** Nothing in v1 creates, changes or cancels an order, approves anything, resumes anything or changes a limit. The route inventory test (`02` section 8) enforces it.
2. Reads are `GET`. The only writes are queue requests (`POST` a claim check, `POST` a research queue proposal) and `POST /halt`.
3. Every response is JSON. Errors are `application/problem+json` (RFC 9457).
4. Every performance figure is a `Metric` object, never a bare number.
5. Lists are cursor-paginated.
6. Versioning: the path carries the major version. Additive changes do not bump it. A field is never repurposed.

## 2. Authentication and scopes

- Header: `Authorization: Bearer apx_<id>_<secret>`.
- Keys are created in Settings (signed-in session only), shown once, stored as `sha256(secret + APEX_API_KEYS_PEPPER)`, revocable, with a last-used time.
- Scopes: `read:status`, `read:board`, `read:slots`, `read:book`, `read:ledger`, `read:reports`, `read:data`, `read:agents`, `queue:claims`, `queue:research`, `halt`. A key gets the least it needs: the MCP default is all `read:*` plus `queue:claims`; the extension gets `queue:claims` and `read:status` only.
- The dashboard's own session cookie also works on v1 reads (same origin only).
- There is deliberately no scope for approve, resume, limits or live.

## 3. Common shapes

```ts
type Metric = { value: number; unit: 'pct'|'usd'|'ratio'|'count'|'prob'; n: number; basis: 'in_sample'|'forward'|'book'; net: boolean; receipt?: number }
type Page<T> = { items: T[]; next: string | null }
type Problem = { type: string; title: string; status: number; detail?: string; instance?: string; code: string }
type Receipt = { seq: number; kind: string; ts: string; actor: string; payloadHash: string; prevHash: string; hash: string; inputHash?: string; resultHash?: string }
```

Query parameters on lists: `limit` (default 50, max 200), `cursor`. Times are RFC 3339 UTC. Every response carries `x-apex-mode: paper`, `x-apex-trials: <N>`, and `ETag`; `If-None-Match` returns `304`.

Error codes: `unauthorized` 401, `forbidden_scope` 403, `not_found` 404, `validation` 422, `rate_limited` 429 (with `Retry-After`), `halted` 409 (for queue writes while the kill switch is on), `budget` 409 (trial or AI budget reached), `unavailable` 503.

Rate limits (per key, Redis counters): 120 reads a minute, 10 queue writes an hour, 5 halts an hour. Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

## 4. Endpoints

| Method and path | Scope | Returns |
|---|---|---|
| `GET /status` | `read:status` | Mode, halts, last and next run, trial counts `N` and `M`, needs-you count, data status, AI spend, setup gaps |
| `GET /funnel` | `read:board` | Counts by status |
| `GET /board` | `read:board` | `Page<Evaluation>`; filters `status`, `strategy`, `market`, `tf`, `panel`; sort `checks` (default) or `sharpe` |
| `GET /pairs/{trialKey}` | `read:board` | One evaluation in full: checks, why, validator runs, regime split, receipt |
| `GET /strategies`, `GET /strategies/{id}` | `read:board` | Registry entries: name, source, style, timeframe, fingerprint, frozen |
| `GET /slots`, `GET /slots/{key}` | `read:slots` | Slot with status, role, lock, weight, graduation clock, drift state, locks |
| `GET /slots/{key}/trades` | `read:slots` | Forward strategy-record trades |
| `GET /slots/{key}/events` | `read:slots` | Status transitions with reasons |
| `GET /slots/{key}/drift` | `read:slots` | CUSUM readings |
| `GET /book` | `read:book` | Equity, day, week, drawdown, benchmarks, limits usage |
| `GET /book/positions`, `/book/fills`, `/book/intents` | `read:book` | Open positions; fills; intents with guard rules (`ok` filter) |
| `GET /risk` | `read:book` | Limits (value, ceiling, pending), halts, exposure by class and cluster |
| `GET /locks/{slotKey}` | `read:slots` | The four locks as `liveAllowed()` reports them |
| `GET /queue`, `GET /queue/{id}` | `read:board` | Research queue |
| `POST /queue` | `queue:research` | Propose an item (status `proposed`). Body: title, why, kind, draft prereg. `202` |
| `GET /data/health`, `GET /data/datasets/{id}` | `read:data` | Health rows; one dataset with versions and checks |
| `GET /costs` | `read:data` | Current cost model |
| `GET /regime` | `read:data` | Context panel |
| `GET /reports`, `GET /reports/{id}` | `read:reports` | Index; one report (`?format=md` returns Markdown) |
| `GET /ledger` | `read:ledger` | `Page<Receipt>` with `kind`, `slot`, `from`, `to` filters |
| `GET /ledger/{seq}` | `read:ledger` | Entry with payload |
| `GET /ledger/head` | `read:ledger` | Head seq and hash, last anchor |
| `GET /ledger/verify?from=&to=` | `read:ledger` | Chain check result for a range (max 5,000 entries a call) |
| `POST /claim-checks` | `queue:claims` | Start a claim check. Body below. `202` with id |
| `GET /claim-checks`, `GET /claim-checks/{id}` | `queue:claims` | History; status and result |
| `GET /agents`, `/agents/activity`, `/agents/inbox` | `read:agents` | Roster, audit rows, jobs needing Jeremy |
| `GET /automations` | `read:agents` | Job table with last and next run |
| `POST /halt` | `halt` | Pull the andon cord. Body: `{ reason }`. Idempotent |

`POST /claim-checks` body:

```json
{ "kind": "transcript", "text": "…", "title": "optional", "market": "optional", "tf": "optional",
  "sourceUrl": "optional, stored as a label only, never fetched by the server", "idempotencyKey": "optional" }
```

Response when done (`GET /claim-checks/{id}`): `{ id, status, verdict, headline, claims[], interpretations[{ spec|template, assumptions[], checks[], metrics: Metric[] , trialKey, receipt }], unsupported[], flags[], data[], costs, trialsUsed }`.

## 5. Session-only routes (not part of v1, dashboard only)

These need the signed-in session and, where marked, the password again. They are listed here so the build keeps them out of v1.

| Route | Purpose |
|---|---|
| `POST /api/admin/queue/{id}/approve`, `/drop` | Research queue decisions |
| `POST /api/admin/slots/{key}/pause` | Pause (no re-auth; safer) |
| `POST /api/admin/slots/{key}/resume`, `/retire` | Re-auth and typed name |
| `POST /api/admin/halt/release` | Release the andon cord or kill switch. Re-auth |
| `POST /api/admin/live/{key}/approve` | Lock 3. Re-auth and typed name |
| `POST /api/admin/keys`, `DELETE /api/admin/keys/{id}` | API keys |
| `POST /api/admin/settings/receipts` | Public receipts page on or off |

## 6. Ingest and cron routes (existing, hardened)

`/api/ingest/*` (bots, recorder manifests, later executor fills) require `APEX_INGEST_TOKEN` and fail closed when it is unset in production. Executor posts additionally carry an HMAC over the body and a timestamp. `/api/cron/*` require `CRON_SECRET`. Neither family is reachable with an API key.

## 7. Public routes

- `GET /receipts` and `GET /api/public/receipts` (only when Jeremy has switched the page on): slots' forward records with ledger receipts and anchors. No auth, cached for 5 minutes, no account data.
- `GET /api/public/ledger/head`: head hash and last anchor, for outside verification.

## 8. SDK

`packages/sdk` exports a typed client generated from the OpenAPI file plus three helpers: `waitForClaimCheck(id)`, `paginate(fn)`, `verifyReceipt(receipt, payload)`. The CLI in remote mode, the MCP server and the extension use only this client.

## 9. Tests

- Contract: every route in the registry appears in `openapi.yaml` and the reverse; response fixtures validate against the schemas.
- Auth: each route with no key, a revoked key, a key missing the scope, and a correct key.
- No `Metric` without `n` and `basis` (schema-level).
- Rate limits and `Retry-After`.
- `POST /claim-checks` is idempotent on `idempotencyKey`.
- The inventory test: no route name, scope or handler imports anything from `packages/autopilot/src/broker` or the admin handlers.
