// Claim check from the dashboard. Jeremy only, from the dashboard itself. `run: false` plans and writes nothing; `run: true`
// records the check and uses tries from the weekly budget. The source text is never stored: the ledger gets hashes and results.
import { isAdmin } from '@/lib/auth';
import { claimCheck } from '@/lib/claimrun';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  const b = await req.json().catch(() => null); if (!b || typeof b !== 'object') return Response.json({ error: 'Send the source text.' }, { status: 422 });
  const r = await claimCheck({ text: b.text, kind: b.kind, extraction: b.extraction, run: b.run === true });
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status });
}
