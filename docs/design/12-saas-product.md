# 12. Product track: the claim checker as a service

Plan Phase 5. Working name: **Proof** (a placeholder until Jeremy picks a name and a domain and a trademark search is done). This file designs the product. It is a business separate from Jeremy's own trading, in a separate deployment with its own database and keys.

## 1. What it is

A web service that answers "does this trading strategy actually work?" for people who are about to buy a bot, a course or a signal group, or who built a rule themselves. The user pastes a transcript, a Pine script or a sales page. Proof extracts the exact rules, tests them with the same gate Apex uses, and shows claimed against measured.

**What it sells:** an honest test and a clear page. **What it never sells:** signals, picks, managed money, or a promise that anything works.

Why this and not a bot store: the study found that the only model in the archive that reliably makes money is selling tools and education, and that 45 of 105 sources carried an affiliate link, a paid group or a sponsor. The people buying those products have no cheap way to check them. Most checks will come back "no edge", and the product is built so that this is the expected, useful answer.

## 2. Who it is for

| Person | Situation | What they need |
|---|---|---|
| **The buyer** | About to pay for a bot, course or group | A fast, plain verdict and the reasons, before paying |
| **The builder** | Writes Pine or rules of their own | The stress checks they do not know how to run, and a count of their own tries |
| **The reviewer** | Runs a channel, newsletter or community that covers trading tools | Repeatable tests they can cite, with a share link |
| **The Claude user** | Works in Claude Desktop or Claude Code | The same checks as a connector and a plugin |

## 3. Scope

**Version 1 (private beta):**
- Sign in, paste or upload, extraction with quotes, assumptions the user can edit, the gate, the verdict page (`05` section 6), history, export to Markdown and PDF.
- A per-account trial ledger: every re-run is counted and shown ("you have tried 6 versions of this rule").
- Free and paid plans with monthly quotas, through Stripe.
- Daily bars for US stocks and ETFs and major crypto, under a commercial data licence.

**Version 1.1:** intraday bars; browser extension; API keys; MCP connector with OAuth; share links.

**Version 1.2:** forward paper tracking: lock a passing rule and get a monthly forward record with receipts (the incubator as a product feature).

**Not in the product, ever:** live trading, broker connections, holding anyone's exchange or broker keys, signals or alerts to trade, copy trading, rankings of named vendors, a marketplace of strategies, leverage or position advice.

## 4. Architecture

```
apps/proof (Next.js on its own Vercel project)
  ├─ marketing pages, app pages, /api/v1 (same contract as 09, tenant-scoped), /api/mcp, Stripe webhook
  ├─ uses packages: engine, kernel (ledger, gate), claims, data, store, sdk, ui
  └─ does NOT use: autopilot broker, the personal web app, bots, any of Jeremy's data or keys
Postgres (its own Supabase project, row-level security on every tenant table)
Redis (its own Upstash database: rate limits, queues, locks)
Object store (inputs and results, per-tenant prefix, encrypted at rest)
Workers: Vercel functions for extraction and small panels; a queue plus GitHub-hosted or container workers for large panels
Stripe (Billing, Checkout, Customer Portal, webhooks)     Model: Claude through one gateway, with a per-tenant spend cap
```

**Separation from personal Apex** is a hard rule: different Vercel project, different database, different model key, different data licence. The only thing shared is code in `packages/`. A change to `packages/kernel` or `packages/engine` runs both apps' test suites.

### 4.1 Tenancy and data model

Every tenant table has `account_id` and a row-level security policy `account_id = auth.uid()`-scoped (through a membership table when teams arrive). Server code uses the user's JWT for reads and writes; the service role is used only by the billing webhook and the workers, in narrowly scoped functions.

```sql
accounts(id, email, created_at, plan, stripe_customer_id, status)
subscriptions(account_id, stripe_subscription_id, plan, status, period_start, period_end, cancel_at)
usage(account_id, period_start, checks_used, tries_used, ai_usd, compute_seconds)
claim_checks(id, account_id, created_at, status, title, source_kind, input_uri, input_hash, extraction jsonb, verdict, result jsonb, trials_used, visibility)
ledger(seq, account_id, ts, kind, actor, payload, payload_hash, prev_hash, hash)        -- one chain per account
trials(account_id, trial_key, first_seq, …)
api_keys(id, account_id, name, hash, scopes, created_at, last_used, revoked_at)
shares(id, claim_check_id, account_id, created_at, revoked_at, redactions jsonb)
events(id, account_id, ts, kind, detail)                                             -- product analytics, no input text
```

Inputs (the pasted text) are the user's data: stored encrypted, visible only to them, deleted on request and automatically after 12 months unless kept. They are never used to train anything and never shown to other users.

### 4.2 Auth

- Supabase Auth: email magic link and Google sign-in. No passwords to store.
- API keys for the API; OAuth 2.1 with PKCE for the MCP connector and the extension.
- Admin (Jeremy): a separate admin role with an audit log; no impersonation without a logged reason.

### 4.3 Jobs

A claim check is a job with steps (extract, plan, run, verdict), each resumable and idempotent. Queue on Redis; a per-account concurrency of 1 on the free plan and 3 on paid. A job that exceeds its compute budget stops with a partial result and a refund of the check.

## 5. Plans and limits

Prices are Jeremy's to set after the beta. The structure is the design.

| | Free | Trader | Pro |
|---|---|---|---|
| Checks a month | 3 | 40 | 200 |
| Interpretations a check | 1 | 3 | 3 |
| Data | Daily bars | Daily and intraday | Daily and intraday, larger panels |
| Edit and re-run | no | yes (counts as a check and a try) | yes |
| Export | Markdown | Markdown, PDF | Markdown, PDF |
| Extension | no | yes | yes |
| API and MCP connector | no | no | yes |
| Forward paper tracking (1.2) | no | 1 rule | 10 rules |
| Share links | no | yes | yes |
| Price | $0 | to be set | to be set |

Billing through Stripe Billing: monthly and annual subscriptions, Checkout for purchase, the Customer Portal for changes and cancellation, tax handled by Stripe Tax. Usage is counted in `usage` and enforced server-side before a job starts; a check that fails for a reason on Proof's side does not count. Webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`) are verified by signature and are idempotent on the event id. Downgrades take effect at period end. Refunds follow a simple stated policy.

Unit cost per check, to be measured in the beta before prices are set: one extraction call (the main cost), compute for the gate (about 30 CPU-seconds per dataset), and data licence share. The free plan uses daily bars and one interpretation so that its cost stays small.

An alternative sales channel exists because Jeremy has a Whop account connected: Proof could also be sold as a Whop product with access granted by webhook. Recommendation: build on Stripe first because it gives metering, tax and the portal; revisit Whop as a second storefront after launch.

## 6. Screens

The verdict page is the product; it is specified in `05` section 6 and drawn on the design canvas ("Product: Proof landing page" and "Claim check result").

| Screen | Purpose | Notes |
|---|---|---|
| Landing | Say what it does in one sentence, show a real example result, how a check works, pricing, the method page link | Light theme. The example is a real `no edge` result. No testimonials or return figures of users |
| Method | The six checks, the hold comparison, try counting, data and costs, what a verdict does and does not mean, limitations | Written for a careful beginner. This page is the trust anchor |
| Sign in | Magic link, Google | |
| New check | Paste or upload, optional market and timeframe, quota line | Same as `07` section 4.10 |
| Result | The verdict page | Private by default |
| History | List of checks with verdict chips, tries per rule family | |
| Rule page | One rule family: every version tried, with the count and the deflated readout | "You tried 6 versions. The best one is marked down for that." |
| Account | Plan, usage this period, invoices (Stripe portal), API keys, data export and delete | |
| Shared result | Read-only public page for a share link | Section 7 |
| Admin | Accounts, usage, failed jobs, cost per check, abuse flags | Jeremy only |

Onboarding: after sign-in, one screen with a sample transcript button ("Try it with a famous strategy") that runs a pre-computed example without using a check, then the paste box.

## 7. Sharing, and what a public page may say

A verdict about rules is a factual report of a test. A verdict that names a person or a product can read as an accusation. The design keeps Proof on the right side of that line.

- Results are private by default.
- A share link shows: the verdict, claimed against measured, the checks, the rules as extracted, the data and method, and the date. It does **not** show the source text, the source URL, the channel or vendor name, or the title the user gave, unless the user adds a title themselves, in which case the page states "Title written by the person who shared this."
- Fixed wording only; the banned-words test from `05` applies to every public template.
- Every shared page has "Report a problem with this page". A dispute process (acknowledge in 2 business days, review the extraction, correct or take down) is written into the terms.
- Proof itself never publishes rankings or lists of named vendors.

## 8. Data licence

Personal-use market data cannot back a paid product. Before the beta, a commercial plan is chosen from a provider whose terms allow running computations for end users and displaying derived statistics (returns, counts, drawdowns), not raw bars. Requirements for the choice: US stocks and ETFs daily for at least 10 years and intraday for at least 2; major crypto; clear terms on derived data; a price that fits the plan table. Proof never returns raw price series through its API or pages; charts show the strategy's equity curve and trades, which are derived. The choice and its terms go in `apps/proof/DATA_LICENCE.md`. This is a cost Jeremy approves; it is listed under decisions in `00-README.md`.

## 9. Legal and compliance (needs a lawyer before public launch)

This section lists what must be decided; it is not legal advice.

- **Not investment advice.** Proof tests rules on historical data and reports statistics. It does not tell anyone what to buy or sell and is not personalised. The terms, the footer and every result say so. Whether any feature crosses into regulated advice depends on the country; a lawyer reviews the product and the wording before public launch.
- **No promises.** No copy implies future returns. `holds up` is always followed by the fixed sentence about past data and forward paper trading.
- **Defamation.** Section 7.
- **Terms of service and privacy policy**: needed before the beta takes outside users. Privacy: what is stored, retention, deletion, sub-processors (Supabase, Vercel, Stripe, Anthropic, the data provider).
- **Site terms for the extension**: `11` section 2.
- **Payments and tax**: Stripe handles card data; Proof never sees card numbers. Stripe Tax for sales tax and VAT.
- **Business entity, bank account, Stripe account, domain**: Jeremy's to set up. The build uses Stripe test mode and a sandbox until he does.
- **Model provider terms**: user-submitted text goes to the model provider for extraction; the privacy policy says so, and inputs are sent with the provider's no-training terms.

## 10. Abuse and safety

- Inputs are untrusted (prompt injection handled as in `05`).
- Rate limits per account and per IP; sign-up friction (email verification) on the free plan; disposable-email block list.
- Size limits (200k characters), file-type allow-list, no URL fetching by the server (the user or the extension supplies text), which removes server-side request forgery risk.
- Content: the extractor refuses inputs that are not about trading rules and does not count them.
- Per-tenant AI and compute caps; a global daily cap that pauses the free plan first.
- Secrets pasted by mistake are redacted before storage.

## 11. Metrics

North star: checks completed per week by accounts that have run more than one.

Also tracked: sign-up to first verdict (target under 3 minutes), share of `untestable` (a product-quality signal: lower is better), extraction edit rate (how often users correct an assumption), free to paid conversion, cost per check, 30-day retention, share links created. Product analytics store event kinds and counts, never input text.

## 12. Launch stages

| Stage | Who | Gate to the next |
|---|---|---|
| **5a. Internal** | Jeremy and the archive (run the 105 sources through it) | `untestable` under 30% on the archive; extraction fixtures pass; costs measured |
| **5b. Private beta** | Invited users, free, Stripe in test mode | Terms and privacy published; data licence signed; lawyer's review of wording done; support inbox answered |
| **5c. Paid** | Public sign-up, Stripe live | Jeremy's go: entity, bank, prices, domain |
| **5d. Surfaces** | Extension, API, MCP connector, then forward tracking | Each ships behind a flag |

Going from 5b to 5c involves real money and public claims, so it is Jeremy's decision, recorded like any other approval.

## 13. Tests

- **Tenant isolation**: for every table and every API route, user A cannot read or write user B's rows (automated, runs against a real database in CI).
- **Billing**: webhook signature and idempotency; plan changes; quota enforcement at the boundary; a failed job does not consume a check.
- **Shared pages**: never contain the source text, URL or vendor name; banned-words test.
- **Separation**: `apps/proof` cannot import `packages/autopilot/src/broker`, `web/`, or `bots/` (lint rule); its env schema rejects any of the personal app's variables.
- **Load**: 50 concurrent checks stay inside the function limits or move to the worker queue.
- Everything in `05` section 10.
