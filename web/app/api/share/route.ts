// Where the installed app's share target lands when the service worker is not in charge yet (docs/design/07 s6). It writes
// nothing and runs nothing: it only sends the browser to New claim check with the start of the shared text in the address,
// where the form shows it and waits for Plan. The service worker handles the same request without the length cut.
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const CUT = 1500;
export async function POST(req: Request) {
  let shared = '';
  try { const f = await req.formData(); shared = ['title', 'text', 'url'].map(k => String(f.get(k) ?? '').trim()).filter(Boolean).join('\n\n'); } catch { /* not a form: open the empty screen */ }
  const to = new URL('/claims', req.url); if (shared) to.searchParams.set('text', shared.slice(0, CUT));
  return NextResponse.redirect(to, 303);
}
export async function GET(req: Request) { return NextResponse.redirect(new URL('/claims', req.url), 303); }
