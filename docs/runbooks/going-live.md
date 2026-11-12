# Going live

**Nothing in this repository can trade real money today.** The executor (`apps/executor`) exists and rehearses by default, but it has no live broker adapter, because the venue is not chosen. Lock 2 now has a record (`promotion_review`), but no slot has the forward record it needs. This page is the list to work through before that changes. Steps 3 to 5 can be rehearsed with `apex-executor run --once`, which sends nothing.

## How you notice
A slot's screen shows lock 1 open (live eligible). That takes at least six months of forward paper trading and a strict check on that record. Lock 2 then opens when you press "Run the promotion review" on the slot's screen and the review comes back clean.

## Safe first step
Do nothing quickly. Read the slot's forward record, its last monthly check, the validator run made after graduation, and the review notes.

## Steps
1. **Keys.** Make trade-only keys at the venue with withdrawals off and an IP lock. One key per bot. They go on your own machine only, never on Vercel or GitHub.
2. **Venue rules.** Check the venue's current rules for small accounts and intraday trading, including the pattern-day-trading and margin rules that apply on the day. They change.
3. **Approval (lock 3).** On the slot's screen, signed in: "Review for micro-live", tick each line, type the slot's name, enter the password again. This records an approval for the first stage only: 1% of the paper-sized risk, for at most 90 days.
4. **Your machine (lock 4).** On your own machine, in your own shell (never in a file in the repo), set `APEX_DASHBOARD_URL`, `APEX_SIGNOFF_KEY` and `APEX_EXECUTOR_KEY` (the same value as on the dashboard). Then:
   - `npx apex-executor status` shows every slot's four locks and what is missing.
   - `npx apex-executor sign <slot>` asks you to type the slot's name and signs its latest approval.
   - `npx apex-executor run --once` rehearses: it writes what it would send to its journal and sends nothing.
   - Live sending needs `APEX_ALLOW_LIVE=yes`, the adapter's own live flag, and a live adapter for your venue. The adapter is not written yet; `run --live` refuses and says so. See `apps/executor/README.md`.
5. **First week.** Read every fill against the paper fill for the same signal. Check the measured cost against the cost model each day.
6. **Halting from the phone.** Telegram `/halt <reason>` and the Halt button both work from a phone. Try one before the first live day.
7. **If the executor and the broker disagree.** Halt. The broker's record is the truth about money. Do not resume until the difference is explained.
8. **Tax records.** Every fill is in the ledger: `npm run apex -- book --fills --json`.

## How to confirm
`npm run apex -- live status <slot>` shows the four locks as they are. All four open is the only state in which a live order could be sent.

## What to write down
The approval is a ledger entry. Keep your own dated note of why you approved it.
