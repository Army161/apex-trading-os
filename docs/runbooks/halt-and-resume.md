# Halt and resume

## How you notice
You decide to stop, or Apex halts itself. The header on every screen shows "Halted" with who pulled it and why. Telegram gets "APEX HALTED by ...".

## Safe first step
Halt. It is always allowed, needs no sign-in, and only stops things. Any of these works:

- The red Halt button at the top of every screen.
- Telegram: `/halt <reason>`, then tap the confirm button within 2 minutes.
- Terminal: `npm run apex -- halt "<reason>"`.
- An API key with the halt scope, or the MCP `halt` tool.

## Steps
1. Read why it was pulled: `npm run apex -- status`, or the Risk screen under Autopilot. Halt history is at the bottom of that screen.
2. Know what each level stops:
   - **andon** (the cord, in the ledger): the run opens no new paper position. Open positions keep their stops.
   - **kill** (the dashboard's kill switch): the worker bots are told to pause.
   - **book-drawdown**: set by the run itself when the paper book falls past the drawdown limit. No new positions.
3. Fix or understand the cause before resuming. If the cause is a broken ledger, go to `ledger-verify-failed.md` and do not resume.
4. Resume only from the dashboard, signed in: Autopilot, Risk, type the phrase shown (for example `resume andon`) and give a reason. The reason is kept in the ledger.
5. The dashboard's own cord and kill switch are released on Today.

There is no resume in the terminal, in Telegram, in the API or in MCP. That is on purpose.

## How to confirm
`npm run apex -- status` shows no halt. The header shows no "Halted". The next run's report lists intents again.

## What to write down
The resume reason you typed is already in the ledger (`npm run apex -- ledger tail --kind resume`). If the halt was not a drill, add an incident note from `incident-template.md`.
