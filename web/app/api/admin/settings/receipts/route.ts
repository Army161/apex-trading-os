// The switch of the public receipts page (docs/design/09 s5). Red path. Publishing is Jeremy's call, so both directions need
// the signed-in session and a call from the dashboard itself. The page is off until this turns it on.
import { isAdmin } from '@/lib/auth';
import { receiptsOn, setReceipts } from '@/lib/receipts';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ on: await receiptsOn() }); }
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  const b = await req.json().catch(() => ({})); if (typeof b?.on !== 'boolean') return Response.json({ error: 'Say on: true or on: false.' }, { status: 422 });
  await setReceipts(b.on); return Response.json({ on: await receiptsOn() });
}
