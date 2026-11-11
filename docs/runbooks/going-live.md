# Going live

**Nothing in this repository can trade real money today.** The program that would hold live keys and place orders (the executor) is not built, and lock 2 cannot open yet. This page is the list to work through before that changes. It has not been rehearsed, because there is nothing to rehearse it on.

## How you notice
A slot's screen shows lock 1 and lock 2 open. That takes at least six months of forward paper trading and a strict check on that record.

## Safe first step
Do nothing quickly. Read the slot's forward record, its last monthly check, the validator run made after graduation, and the review notes.

## Steps
1. **Keys.** Make trade-only keys at the venue with withdrawals off and an IP lock. One key per bot. They go on your own machine only, never on Vercel or GitHub.
2. **Venue rules.** Check the venue's current rules for small accounts and intraday trading, including the pattern-day-trading and margin rules that apply on the day. They change.
3. **Approval (lock 3).** On the slot's screen, signed in: "Review for micro-live", tick each line, type the slot's name, enter the password again. This records an approval for the first stage only: 1% of the paper-sized risk, for at most 90 days.
4. **Your machine (lock 4).** Not built. It will be a program you run yourself, with a flag you set and a signature made with `APEX_SIGNOFF_KEY`.
5. **First week.** Read every fill against the paper fill for the same signal. Check the measured cost against the cost model each day.
6. **Halting from the phone.** Telegram `/halt <reason>` and the Halt button both work from a phone. Try one before the first live day.
7. **If the executor and the broker disagree.** Halt. The broker's record is the truth about money. Do not resume until the difference is explained.
8. **Tax records.** Every fill is in the ledger: `npm run apex -- book --fills --json`.

## How to confirm
`npm run apex -- live status <slot>` shows the four locks as they are. All four open is the only state in which a live order could be sent.

## What to write down
The approval is a ledger entry. Keep your own dated note of why you approved it.
