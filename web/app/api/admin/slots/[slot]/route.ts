// Bring a paused slot back to paper, or retire a slot, by hand (docs/design/04 s12, 02 s4; docs/runbooks/drift-pause.md). Red path.
// Jeremy only: the signed-in session, a call from the dashboard itself, the password typed again and the slot's name typed out.
// Back to paper needs the strategy to still match its lock, its dataset to load and an agreeing validator re-run since the pause,
// each worked out here, never taken from the form. What it writes is one slot_status entry. It cannot set live_eligible or a
// live stage, approve anything or place an order. No agent, bot, Telegram command, MCP tool, API key or terminal command calls it.
import { dirname, join } from 'node:path';
import { isAdmin } from '@/lib/auth';
import { ledgerStore, loadLedger } from '@/lib/ledger';
import { repoRoot } from '@/lib/claimrun';
import { changeSlot } from '../change';
import { checkAgainstRun } from '../checks';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ slot: string }> }) {
  return changeSlot(req, (await params).slot, {
    session: () => isAdmin(), adminPassword: process.env.APEX_ADMIN_PASSWORD || '', load: loadLedger, check: async (s, now) => checkAgainstRun(repoRoot(), s, now, process.env.APEX_STATE_DIR),
    // The run lock, so a hand change never lands in the middle of a run.
    open: async () => { const o = await ledgerStore(); if (!o) return null;
      const lock = o.kind === 'postgres' ? () => (o.store as unknown as { runLock: () => Promise<(() => Promise<void>) | null> }).runLock()
        : () => import('@apex/store/file').then(m => { const rel = m.fileLock(join(dirname((o.store as unknown as { path: string }).path), 'run.lock')); return rel ? async () => rel() : null; });
      return { store: o.store, lock }; },
  });
}
