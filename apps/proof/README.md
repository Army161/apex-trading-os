# apps/proof

Proof (a working name) is the claim checker as a service: docs/design/12-saas-product.md. It is a business separate from Jeremy's own trading. This folder is its app, and so far it is a skeleton (build plan P5.1): a landing page, a method page, a health route, the settings schema and the separation check. There is no sign-in, no database, no payment and no model call yet.

## Run it

```
npm run dev -w proof-app        # http://localhost:3200
npm run build -w proof-app && npm run start -w proof-app
node tools/separation_check.mjs
```

It needs no setting to run. `.env.example` lists the ones later work packages will need.

## Invariants

1. **Nothing is shared with the personal app except code in seven packages:** `engine`, `kernel`, `claims`, `data`, `store`, `sdk`, `ui`. `tools/separation_check.mjs` fails on any other import, on anything reachable through those packages that is a broker, the order pipeline, the dashboard, a bot, the terminal or the executor, and on anything outside this folder importing from it. Adding a package to the list is a decision for the ADR, not a quick fix.
2. **`lib/env.ts` is the only file that reads the environment.** It refuses every variable of the personal app by name. `ANTHROPIC_API_KEY` is the one name both apps use, and it must hold a different key here.
3. **A deployment with refused settings serves nothing.** `middleware.ts` answers every request with 503 and one line, and logs the names of the settings at fault, never a value.
4. **A live Stripe key is refused until `PROOF_STAGE` is `paid`.** Moving to paid is Jeremy's decision.
5. **Every sentence a public page shows is in `lib/copy.ts`.** A test holds all of it to the wording rules: no promise of returns, none of the words Apex never uses about a source, and the not-advice line on every page.
6. **Never in this product:** live trading, a broker connection, anyone's exchange or broker keys, signals, copy trading, rankings of named vendors.

## The database

`db/migrations/0001_tenancy.sql` is written for a Supabase project and has not been applied to one: there is no project yet. It is a red path. `test/isolation.test.ts` applies it to a throwaway Postgres database (`APEX_TEST_DATABASE_URL` names the server) behind `db/test/supabase_shim.sql`, and checks for every table that one account cannot read or write another's rows.

7. **Row-level security is on and forced on every table,** and a signed-in person can write only two things: start a check and rename it. Everything else is written by the workers. A new table needs the same treatment, and the isolation test fails without it.
8. **The per-account ledger and the count of tries are append-only for every role.**

## Not built yet

Sign-in with Supabase Auth (the second half of P5.2: it needs the Supabase project), the claim check flow (P5.3), billing in Stripe test mode (P5.4), the rest of the screens (P5.5), share links (P5.6). The market data licence is not chosen: see `DATA_LICENCE.md`.

## Only Jeremy can do these

A second Vercel project for this folder, its own Supabase project (then apply `db/migrations` to it and put its URL and keys in the Vercel project), its own model key, a Stripe account (test mode first), a commercial data plan, a name and a domain, and a lawyer's review of the wording before anyone outside uses it.
