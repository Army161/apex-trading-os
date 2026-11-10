import { cookies } from 'next/headers';
import { sessionToken } from '@/lib/auth';
export async function POST(req: Request) {
  const { password } = await req.json();
  if (!process.env.APEX_ADMIN_PASSWORD || password !== process.env.APEX_ADMIN_PASSWORD) return Response.json({ error: 'wrong password' }, { status: 401 });
  (await cookies()).set('apex_session', sessionToken(), { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 14, path: '/' });
  return Response.json({ ok: true });
}
