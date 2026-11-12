// The scout's only way to the web (docs/design/06 s2). It may fetch from a short list of hosts over https and nowhere else.
// A redirect is followed only to a host on the list. What comes back is untrusted text: it is data to read, never instructions.
import { gate, type Trigger } from './policy';
import { ensureRoster } from './roster';

export const SCOUT_HOSTS = ['arxiv.org', 'ssrn.com', 'sec.gov', 'fred.stlouisfed.org'];
/** The built-in hosts plus any in APEX_SCOUT_HOSTS (comma separated, set by Jeremy on the machine that runs the dashboard). */
export const scoutHosts = (env: Record<string, string | undefined> = process.env) =>
  [...SCOUT_HOSTS, ...(env.APEX_SCOUT_HOSTS ?? '').split(',').map(h => h.trim().toLowerCase()).filter(h => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h))];
export function allowedUrl(url: string, hosts = scoutHosts()): URL | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const h = u.hostname.toLowerCase(); return hosts.some(x => h === x || h.endsWith(`.${x}`)) ? u : null;
}
export type Fetched = { ok: true; url: string; text: string } | { ok: false; why: string };
export async function scoutFetch(url: string, o: { fetch?: typeof fetch; hosts?: string[]; trigger?: Trigger; step?: boolean } = {}): Promise<Fetched> {
  const f = o.fetch ?? fetch; let at = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = allowedUrl(at, o.hosts); if (!u) return { ok: false, why: `${hop ? 'It was redirected to' : 'This is'} an address outside the scout's list of hosts, so it was not fetched.` };
    await ensureRoster();
    const v = await gate({ agent: 'scout', verb: 'browse', target: u.hostname, trigger: o.trigger ?? 'routine', step: o.step ?? true });
    if (!v.allow || v.needsApproval) return { ok: false, why: `Refused by the rule "${v.rule}": ${v.why}.` };
    const r = await f(u.href, { redirect: 'manual', headers: { accept: 'text/html,text/plain,application/xml' } });
    if (r.status >= 300 && r.status < 400) { const to = r.headers.get('location'); if (!to) return { ok: false, why: 'It redirected to nowhere.' }; at = new URL(to, u).href; continue; }
    if (!r.ok) return { ok: false, why: `The host answered ${r.status}.` };
    return { ok: true, url: u.href, text: (await r.text()).slice(0, 200_000) };
  }
  return { ok: false, why: 'Too many redirects.' };
}
