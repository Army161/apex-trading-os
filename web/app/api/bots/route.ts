import { bots, events, trades } from '@/lib/bots';
import { persistent, getJSON } from '@/lib/store';
import { authEnabled } from '@/lib/auth';
import { telegramOn } from '@/lib/telegram';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ bots: await bots(), events: await events(80), trades: await trades(200), risk: await getJSON('risk', {}), killed: await getJSON('killswitch', false),
    persistent, authEnabled, ingestTokenSet: Boolean(process.env.APEX_INGEST_TOKEN), aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY), telegramOn, cronSecretSet: Boolean(process.env.CRON_SECRET),
    discordSet: Boolean(process.env.DISCORD_WEBHOOK_URL), alpacaSet: Boolean(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY),
    fredSet: Boolean(process.env.FRED_API_KEY), aiBudget: Number(process.env.APEX_AI_DAILY_BUDGET || 5) });
}
