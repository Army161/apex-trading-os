// /api/v1: the read-and-queue API (docs/design/09). All of it is served by lib/api/serve.ts from the contract in packages/sdk.
// This file only wires that to the real key store, session, ledger and the two writes. It has no order, approve, resume or
// limit route, and it does not import the broker, the resume route or any admin route.
import { loadConfig } from '@apex/kernel/config';
import { buildView } from '@apex/kernel/view';
import { isAdmin } from '@/lib/auth';
import { pullCord } from '@/lib/andon';
import { getJSON, incr, setJSON } from '@/lib/store';
import { ledgerHalt, readLedger, readReport, shellStatus } from '@/lib/ledger';
import { claimCheck } from '@/lib/claimrun';
import { verifyKey } from '@/lib/api/keys';
import { serve, type Ledgered, type ServeDeps } from '@/lib/api/serve';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function ledger(): Promise<Ledgered> {
  const l = await readLedger(), cfg = loadConfig(process.env);
  if (l.kind === 'none') return { ok: false, note: 'no ledger is connected' };
  if (l.kind === 'error') return { ok: false, note: l.note ?? 'it could not be read' };
  try { return { ok: true, entries: l.entries, view: buildView(l.entries, cfg.paperCapital), cfg }; } catch (e) { return { ok: false, note: (e instanceof Error ? e.message : String(e)).slice(0, 200) }; }
}
const deps: ServeDeps = {
  key: async h => { const k = await verifyKey(h); return k && { id: k.id, scopes: k.scopes }; },
  session: () => isAdmin().catch(() => false),
  count: incr, status: shellStatus, ledger, readReport, claimCheck,
  halt: async (by, reason) => { const pulled = await pullCord(by, reason), l = await ledger();
    if (l.ok && l.view.halts.some(h => h.level === 'andon')) return { already: pulled.already, ledger: 'already' };
    return { already: pulled.already, ledger: await ledgerHalt(by, reason) }; },
  remember: { get: k => getJSON<string | null>(k, null), set: (k, v) => setJSON(k, v) },
};
export const GET = (req: Request) => serve(req, deps);
export const POST = (req: Request) => serve(req, deps);
