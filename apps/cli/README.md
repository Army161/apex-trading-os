# apex command line

```
npm run apex -- help
npm run apex -- doctor          # config, ledger chain, fingerprints, data
npm run apex -- run             # one paper run: step paper slots, evaluate a few pairs, write the report
npm run apex -- validate        # independent re-run of anything waiting
npm run apex -- report          # the latest report
npm run apex -- board --top 20  # in-sample results, best first
npm run apex -- halt "why"      # pull the andon cord
```

State lives in `.apex/` (or `APEX_STATE_DIR`): `ledger.jsonl`, `data/` (refreshed bars), `reports/`. With `DATABASE_URL` set, Postgres is the ledger.

## Invariants

- The only commands that write are `run`, `validate`, `halt`, `data pull` and `strategies fingerprint --write`. The first three write ledger entries only.
- There is no order command, no resume command and no command that opens a live lock. `live status` is read-only.
- `--seed` and `--seed-if-empty` accept only an approved plan item (`plan:<id>`). They exempt a batch from the weekly trial budget and record why in each pre-registration.
- One run at a time: a run takes the lock first and releases it at the end.
- A key is never printed. Telegram and data errors never include the URL or the key.
