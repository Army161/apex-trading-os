// The risk officer's scheduled check (docs/design/06 s2), after the nightly run. Vercel Cron (Bearer CRON_SECRET) or a signed-in
// "run now". It reads the paper book from the ledger and compares it with the limits in force. It can halt. It cannot resume.
import { bookAt } from '@apex/kernel/view';
import { effectiveLimits } from '@apex/kernel';
import { isAdmin } from '@/lib/auth';
import { scheduled } from '@/lib/automations';
import { agentIo } from '@/lib/agentio';
import { bookReadings, riskSpec, runJob } from '@/lib/agentjobs';
import { loadLedger } from '@/lib/ledger';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !(process.env.APEX_ADMIN_PASSWORD && (await isAdmin()))) return new Response('forbidden', { status: 403 });
  try {
    return Response.json(await scheduled('risk-officer', async () => {
      const l = await loadLedger(); if (!l.ok) return { error: 'The ledger could not be read, so the book was not checked.' };
      const limits = effectiveLimits(l.cfg.limits, l.view.limits, l.now).limits, job = await runJob(riskSpec(bookReadings(bookAt(l.view, l.now), limits), cron ? 'routine' : 'person'), agentIo);
      return { job: job.id, stage: job.stage, note: job.notes[job.notes.length - 1]?.text };
    }, { byPerson: !cron }));
  } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
