# Running bots on an always-on server (archive/chat/46)

Bots stay in paper mode until Jeremy says otherwise. These notes are for the day he chooses to run them around the clock.

## Keys
- Create **trade-only** API keys. Turn withdrawals off on the exchange or broker side. A trade-only key can't move money out even if it leaks.
- Where the exchange supports it, lock each key to the server's IP address.
- Keep keys in environment variables on the server. Never put them in the repo, the chat, logs or the dashboard. Jeremy creates and pastes the keys himself. Nobody asks him for them in chat.
- Use a separate key for each bot, so one can be revoked without stopping the others.

## Server
- Run one small VM or container with automatic restarts, such as systemd or Docker `restart: unless-stopped`.
- Install only what the bots need. Turn off password SSH and use key login. Close every inbound port except SSH.
- Send each bot's health checks to the dashboard. The andon cord and the kill switch pause every bot from the dashboard or Telegram.
- Schedule a cheap health check every 2 hours that restarts a stuck bot and reports on Telegram (chat/63).

## What already exists
- The **ORB** (opening range breakout) bot already lives in `bots/desk.py`, runs on Alpaca paper and includes fees. chat/46 asked for it to be checked against that existing bot, and it is the same rule. Nothing new was added.
- `web/lib/policy.ts`: agents never get order, transfer, pay or withdraw tools.
- `web/lib/andon.ts`: any check can pause the whole line.

## Future candidates (not installed)
- **Kronos** (financial time-series foundation model, chat/49): a candidate only. Don't install it unless Jeremy asks, and check its license and model weights terms first. Any forecast it makes must beat the lazy forecast (`lazyForecastCheck`) and the monkey test before it can be used.
- The video repos and services named in chat/46–67 (Typesafe, Coinquant, Quant Data, SpotGamma, Bookmap, Barchart Premier, Market Beats, Staret, OpenBot, OpenCode Browse, the AI Profit Boardroom) are not used. Nothing is cloned or signed up for unless Jeremy asks.
