# apex command line

```
npm run apex -- help
npm run apex -- status                 # mode, tries counted, halts, slots, book
npm run apex -- board --top 20         # results on past data
npm run apex -- pair <strategy> <dataset>
npm run apex -- ledger verify          # exit 4 if the chain is broken
npm run apex -- doctor                 # config, ledger chain, fingerprints, data
npm run apex -- run                    # one paper run: step paper slots, evaluate a few pairs, write the report
npm run apex -- validate               # independent re-run of anything waiting
npm run apex -- halt "why"             # pull the andon cord
npm run apex -- tui                    # full-screen view; read-only except for Halt
npm run apex -- status --fixtures      # the same commands on a small made-up ledger, for a look around
```

## Where the answer comes from

| Mode | How | What it can do |
|---|---|---|
| Local | the default in a checkout | Everything. State lives in `.apex/` (or `APEX_STATE_DIR`): `ledger.jsonl`, `data/`, `reports/`. With `DATABASE_URL` set, Postgres is the ledger |
| Remote | `--remote`, or `APEX_API_URL` and `APEX_API_KEY` both set (`--local` overrides) | Read, start a claim check, pull the halt. It goes through the dashboard's `/api/v1` with a key made under You, Setup |
| Fixtures | `--fixtures` | Read only. `fixtures/ledger.jsonl` is made by `fixtures/make.ts`; every name in it starts with `demo_` |

`--json` on a read command prints the answer in the shape the API sends (`docs/design/openapi.yaml`). Exit codes: 0 ok, 1 error, 2 usage, 3 halted or blocked, 4 verification failed.

Shell completion: `eval "$(apex completion bash)"`, `eval "$(apex completion zsh)"` or `apex completion fish | source`.

## Files

- `src/main.ts`: the commands and `COMMANDS`, the registry of every command and what it writes.
- `src/source.ts`: the three places an answer comes from. `src/render.ts`: the text for each shape. `src/tui.ts`: the full-screen view. `src/completion.ts`: the completion scripts.
- `src/runtime.ts`: the store, the data files, the run, Telegram and the sign-off. The nightly job uses it.
- `test/snapshots/`: the text and JSON of every read command on the fixtures. After a wording change that is meant, run the tests once with `UPDATE_SNAPSHOTS=1` and commit the diff.

## Invariants

- The only commands that write are `run`, `validate`, `claim`, `halt`, `signoff`, `data pull` and `strategies fingerprint --write`. The first four write ledger entries only (or, in remote mode, ask the dashboard to). A test holds this list against `COMMANDS`.
- There is no order command, no resume command and no command that opens a live lock. `live status` is read-only. `queue` only lists.
- A command exists only if it is in `COMMANDS` and in the switch; a test fails when the two differ, and when a command or flag is named like something that trades, resumes, approves or takes a secret.
- Read commands print the API's shapes through `render.ts`. A table that shows performance carries n, basis and net, and the commands that touch the paper book open with `PAPER` and the count of tries.
- The API key is read from the environment only, by the client in `source.ts`. No flag takes a key, no output or error includes one, and remote mode refuses a plain `http` address unless it is localhost.
- The full-screen view only reads. Its one write is the halt, which needs a typed reason and then the word `HALT`. No single key changes anything.
- `--seed` and `--seed-if-empty` accept only an approved plan item (`plan:<id>`). They exempt a batch from the weekly trial budget and record why in each pre-registration.
- One run at a time: a run takes the lock first and releases it at the end.
- A key is never printed. Telegram and data errors never include the URL or the key.
- The command line never calls a model.
