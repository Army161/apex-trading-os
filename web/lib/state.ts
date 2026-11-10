// "State" summary (archive/chat/36): one short answer to "what's going on and how far along are we", for the dashboard
// Command card and Telegram /state.
import { allStrategies } from './strategies';
import { bots, trades } from './bots';
import { list, getJSON, persistent } from './store';
import { recentUsage } from './usage';
import { andonStatus } from './andon';
import { listJobs } from './jobs';
import { telegramOn } from './telegram';

export async function state() {
  const [strats, b, t, props, use, andon, jobs] = await Promise.all([allStrategies(), bots(), trades(200), list<any>('proposals', 100), recentUsage(1), andonStatus(), listJobs()]);
  const deployed = strats.filter(s => s.deployment && s.deployment.status !== 'stopped');
  const on = b.filter(x => x.lastSeen && Date.now() - x.lastSeen < 9e5);
  const open = t.filter((x: any) => x.status === 'open' || x.status === 'partial');
  const setup = [['storage (Upstash)', persistent], ['login password', Boolean(process.env.APEX_ADMIN_PASSWORD)], ['bot ingest token', Boolean(process.env.APEX_INGEST_TOKEN)],
    ['Claude API key', Boolean(process.env.ANTHROPIC_API_KEY)], ['Telegram', telegramOn], ['cron secret', Boolean(process.env.CRON_SECRET)]] as const;
  return {
    halted: andon.cord.on, haltReason: andon.cord.reason ?? null, pulls7d: andon.pulls7d, killswitch: await getJSON('killswitch', false),
    strategies: { deployed: deployed.length, paper: deployed.filter(s => s.deployment!.mode === 'paper').length, saved: strats.length },
    bots: { on: on.length, total: b.length }, openPositions: open.length, pendingProposals: props.filter(p => p.status === 'pending').length,
    jobs: { working: jobs.filter(j => j.stage === 'working' || j.stage === 'queued').length, needsYou: jobs.filter(j => j.stage === 'needs_you').length },
    aiToday: +(use.days[0]?.usd ?? 0).toFixed(2), aiBudget: use.budget,
    setup: { done: setup.filter(s => s[1]).length, total: setup.length, missing: setup.filter(s => !s[1]).map(s => s[0]) },
  };
}

export function stateText(s: Awaited<ReturnType<typeof state>>) {
  return [s.halted ? `HALTED: ${s.haltReason}` : s.killswitch ? 'KILL SWITCH ON' : 'Running',
    `Strategies: ${s.strategies.deployed} deployed (${s.strategies.paper} paper), ${s.strategies.saved} saved`,
    `Bots: ${s.bots.on} of ${s.bots.total} reporting, ${s.openPositions} open positions`,
    `Waiting on you: ${s.pendingProposals} proposals, ${s.jobs.needsYou} agent jobs (${s.jobs.working} working)`,
    `AI spend today: $${s.aiToday} of $${s.aiBudget}`, `Andon pulls this week: ${s.pulls7d}`,
    `Setup: ${s.setup.done} of ${s.setup.total} done${s.setup.missing.length ? ` (missing ${s.setup.missing.join(', ')})` : ''}`].join('\n');
}
