# A slot was paused for drift

## How you notice
A report says a slot moved to `paused_drift`. The slot's screen shows the reason and the readings. Risk, under Autopilot, shows each slot's reading against its alarm line and its pauses so far.

## Safe first step
Nothing. The pause is the safe state: a paused slot opens no new position.

## Steps
1. Read the readings: `npm run apex -- slot <key> --drift`, and the events with `--events`.
2. Ask what changed: the market, the costs, or the data. `npm run apex -- costs` shows the cost model against what was observed.
3. Leave it paused. The third drift pause retires the slot for good.
4. To bring it back, wait for the validator's re-run after the pause (the next nightly run makes one). If it agrees, open the slot on the dashboard while signed in and choose Back to paper: type the slot's name, your password again and why. It goes back to paper only, never straight to live, so its forward record and graduation are earned again. Retire works the same way and is final. Neither exists in the terminal.

## How to confirm
`npm run apex -- slots` shows the slot's status. The paper book holds no new position for it.

## What to write down
The pause and its numbers are in the ledger (`npm run apex -- ledger tail --kind slot_status`). No note is needed unless you think the alarm itself was wrong.
