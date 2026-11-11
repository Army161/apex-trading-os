# Rotate keys

## How you notice
A key was pasted somewhere it should not be, a machine was lost, someone left, or it has been a long time.

## Safe first step
If a key that can do something is exposed, revoke that key first, then replace it. No key held by the dashboard or by GitHub can trade: none is there.

## Steps
Which key lives where, and how to change it:

| Key | Where it is set | To rotate |
|---|---|---|
| API keys (`apex_...`) | Made on You, Setup. Stored as a hash | Revoke it on You, Setup and make a new one. A revoked key stops at once |
| `APEX_API_KEYS_PEPPER` | Vercel environment | Changing it retires every API key at once. Make new keys afterwards |
| `APEX_ADMIN_PASSWORD` | Vercel environment | Change it and redeploy. Every session is signed out |
| `APEX_INGEST_TOKEN` | Vercel environment, and each bot | Change both sides. Bots are refused until theirs matches |
| `CRON_SECRET` | Vercel environment | Change it and redeploy. Vercel sends the new one |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Vercel environment and GitHub Actions secrets | Revoke the token with BotFather, set the new one, and set the webhook again with the new secret |
| `ANTHROPIC_API_KEY` | Vercel environment | Make a new key in the Anthropic Console, set it, delete the old one |
| `MASSIVE_API_KEY` | GitHub Actions secret | A data key. Replace it at the data provider and in the secret |
| `DATABASE_URL` | Vercel environment and GitHub Actions secret | Reset the database password at the provider and update both |
| `APEX_SIGNOFF_KEY` | Your own machine only. Never GitHub, never Vercel | Make a new long random value. Sign-offs made with the old one stop counting |

Never type a key into a chat, a commit, an issue or a log.

## How to confirm
The old API key is refused: `npm run apex -- status --remote` with the old key in `APEX_API_KEY` fails, and with the new key it answers. The dashboard asks you to log in again after a password change.

## What to write down
The date and which keys, in an incident note if a key was exposed. Never the key itself.
