# apps/executor

`apex-executor`: the small process that would send an approved intent to a live broker (docs/design/02 section 6). It runs only on Jeremy's machine. Live trading is off, no live broker adapter exists, and `run` rehearses unless told otherwise.

For every new intent from the paper pipeline, on a slot whose locks 1 to 3 are open, it runs these steps in order and stops at the first failure (`src/steps.ts`):

| Step | Checks | On failure |
|---|---|---|
| 0 fresh | The intent was written by the paper pipeline (`mode: 'paper'`, actor `autopilot`), after the slot's approval, its symbol, asset class and side fit the slot, and its signal bar is the most recent closed bar for the slot's timeframe | Refused. A stale intent is never sent late |
| 1 chain and locks | The ledger chain from genesis through the intent; every anchor entry and every head saved by `apex ledger anchor` must match it. Then `liveAllowed` with the machine lock: `APEX_ALLOW_LIVE` is `yes`, the adapter's own live flag is on, and the local signature matches this approval under `APEX_SIGNOFF_KEY` | Refused |
| 2 halts | The dashboard's `/api/status` says not halted, and the ledger has no active halt or drawdown pause. Live also needs `APEX_EXECUTOR_KEY`, so the fill can be reported | Unreachable or unclear means halted |
| 3 not sent before | The id is `intentId(slot key, bar time, side)` from the pipeline; it is not in the local journal, the ledger's live fills or the broker's client order ids | Refused as a duplicate |
| 4 reconcile | Broker positions and open orders match the live book for every slot, and every live position has a stop resting at the broker, on the opposite side, covering its whole quantity | The andon cord is pulled (a ledger halt, and Telegram when set) |
| 5 guard | `checkIntent` with the broker's equity, the live book, and the paper risk times the approved stage's size (`STAGES`), capped by the approval's size cap. Only `micro_live` with a cap of at most 0.01 is accepted until a scale check exists | Refused with the rule ids |
| 6 place | One bracket: the entry plus a hard stop resting at the broker (and the target). The intent is claimed in the journal (an O_EXCL marker file) and the journal is written before the broker is called | No resting stop confirmed: the entry is cancelled and the cord is pulled. No answer: never resent, and the cord is pulled |
| 7 post | The fill goes to the journal, then to `/api/executor/fill`, signed with `APEX_EXECUTOR_KEY` (`packages/kernel/src/executor-auth.ts`) | Posted again from the journal on the next run. Never sent to the broker again |

## Invariants

- This is the only code that would ever hold live keys. No other folder holds a broker client that can trade, and the `apex` command line has no order, sign or go-live command.
- It runs only on Jeremy's machine. Never on Vercel, never in GitHub Actions, never in a container someone else controls. Its journal and signatures live outside the repo (`~/.apex/executor` by default); a folder inside a git checkout is refused.
- Fail closed. A dashboard that cannot be reached, a journal or broker that cannot be read, an unknown stage, a missing key or a broken chain is a refusal, never a guess.
- Rehearsal is the default. `run` without `--live` does steps 0 to 5 and writes what it would have sent to the journal under its own `rehearsal` marker. Its broker records and never sends, and its live flag is always off. A rehearsal still needs locks 1 to 3 and a valid signature; only the live flags are not needed.
- Live sending needs all four locks, an installed adapter, and both live flags, which Jeremy sets himself. Nothing in this repo gives a live flag a value, and no agent does.
- Keys are never printed, logged, written or sent. Only HMAC signatures leave this machine. `sign` saves the signature over one approval entry, never the key.
- Every intent is sent at most once: it is claimed with an exclusive marker file and the journal is written and flushed before the broker is called, and the broker's client order id is the intent id, which an adapter must refuse to reuse. One `run` at a time holds `run.lock` in the executor's folder; a lock left by a crash is never taken over by age and is cleared by hand.
- The ledger chain is always verified from genesis. An anchor is read from the ledger it vouches for, so it only adds a check.
- Only `micro_live`, at most 1% of the paper-sized risk, is signed or sent until a scale check exists.
- When the andon cord is pulled, Telegram is sent even if the ledger halt cannot be written, and the alert says so.
- No live broker adapter is written until a slot reaches lock 3 and the venue is chosen (docs/design/02 section 6). Until then `run --live` refuses and says so.

## How Jeremy would run it

On his own machine, in a checkout of this repo, with the ledger reachable (`DATABASE_URL`, or `APEX_LEDGER_FILE` for a file ledger) and these set in his own shell, never in a file in the repo:

- `APEX_DASHBOARD_URL`: the dashboard's https address (read for halts, and where fills are posted).
- `APEX_SIGNOFF_KEY`: 32 characters or more. The same key he uses for `apex signoff`.
- `APEX_EXECUTOR_KEY`: 32 characters or more, the same value as in the dashboard's environment, so the fill route accepts the post.
- `APEX_EXECUTOR_DIR` (optional): where the journal and signatures live. Default `~/.apex/executor`.

```
npx apex-executor status            # every slot's four locks and what is missing
npx apex-executor sign <slot>       # lock 4: asks him to type the slot key, then signs the slot's latest approval
npx apex-executor run --once        # rehearsal: what would be sent goes to the journal; nothing is sent
```

`run` without `--once` keeps polling (every `APEX_EXECUTOR_POLL_SEC` seconds, at least 15). `run --live` exists for the day an adapter does; today it refuses.

## Not built yet

- The live broker adapter (`LiveBroker` in `src/broker.ts` says what one must provide). The tests use a fake.
- Posting an entry fill the broker reports after `submitBracket` returns (`entry: null`). Until it exists, that fill is never posted, the next run's step 4 disagrees and pulls the andon cord, which is the safe direction.
- Posting exit fills (stop, target) back from the broker. Until it exists, the first exit at the broker makes step 4 disagree and pull the andon cord, which is the safe direction.
- Freshness uses the timeframe's length only, with no market calendar, so an intent whose next bar falls after a weekend or holiday is refused as stale.
