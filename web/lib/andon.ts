// Andon cord (archive/chat/37): any agent, bot or check can stop the whole line. Pulling it pauses every bot (the same
// path as the global kill switch), logs who pulled it and why, and escalates to Jeremy on Telegram. Only Jeremy releases it.
// The pull count is shown on the dashboard: it should not be zero forever, and a rising count is worth a look.
import { getJSON, setJSON, push, list } from './store';
import { sendTelegram } from './telegram';

export type Cord = { on: boolean; ts?: number; by?: string; reason?: string };
export type Pull = { ts: number; by: string; reason: string; released?: number };
/** A check reports a reading against a hard line. Drawdown and daily loss are negative returns; errors is a count. */
export type Reading = { kind: 'drawdown' | 'daily_loss' | 'errors'; value: number; limit: number };

/** Which command a polling bot gets. Pure, so mutation tests cover it. */
export function botCommand(killswitch: boolean, cord: Cord, queued: string | null): string | null {
  if (killswitch || cord.on) return 'pause';
  return queued;
}

/** True when a reading has crossed its line and the cord should be pulled. */
export function shouldPull(r: Reading): boolean {
  // NaN readings never pull: every comparison with NaN is false.
  if (r.kind === 'errors') return r.value >= r.limit;
  return r.value <= r.limit; // drawdown / daily_loss: e.g. -0.27 <= -0.25
}

export const cord = () => getJSON<Cord>('andon', { on: false });

export async function pullCord(by: string, reason: string) {
  const was = await cord();
  const now = Date.now();
  await setJSON('andon', { on: true, ts: was.on ? was.ts : now, by: was.on ? was.by : by, reason: was.on ? was.reason : reason });
  await push('andon_log', { ts: now, by, reason } as Pull, 500);
  await push('events', { ts: now, bot: by, level: 'halt', message: `ANDON CORD pulled: ${reason}. Every bot is told to pause.` });
  if (!was.on) await sendTelegram(`APEX HALTED by ${by}: ${reason}\nEvery bot is paused. Check the dashboard, then send /release when it is safe.`);
  return { on: true, already: was.on };
}

export async function releaseCord(by = 'you') {
  const was = await cord();
  await setJSON('andon', { on: false });
  await push('events', { ts: Date.now(), bot: by, level: 'control', message: was.on ? `andon cord released (was: ${was.reason})` : 'andon cord was not pulled' });
  return { on: false };
}

export async function andonStatus() {
  const pulls = await list<Pull>('andon_log', 500);
  const wk = Date.now() - 7 * 864e5;
  return { cord: await cord(), pulls: pulls.length, pulls7d: pulls.filter(p => p.ts >= wk).length, recent: pulls.slice(0, 10) };
}

/** Run each reading; pull once with every crossed line in the reason. */
export async function check(by: string, readings: Reading[]) {
  const hit = readings.filter(shouldPull);
  if (!hit.length) return { pulled: false };
  await pullCord(by, hit.map(r => `${r.kind} ${r.kind === 'errors' ? r.value : (r.value * 100).toFixed(1) + '%'} past limit ${r.kind === 'errors' ? r.limit : (r.limit * 100).toFixed(1) + '%'}`).join('; '));
  return { pulled: true, hit };
}
