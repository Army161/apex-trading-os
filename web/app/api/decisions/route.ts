// Decision log and AI call log (archive/chat/37): what each agent decided and why, and every model call with cost and time.
import { isAdmin } from '@/lib/auth';
import { decisions, recentCalls } from '@/lib/gateway';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  return Response.json({ decisions: await decisions(100), calls: await recentCalls(100) });
}
