import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
const PW = process.env.APEX_ADMIN_PASSWORD || '';
export const authEnabled = Boolean(PW);
export const sessionToken = () => crypto.createHash('sha256').update(`apex:${PW}`).digest('hex');
export async function isAdmin() {
  if (!authEnabled) return true;
  const c = (await cookies()).get('apex_session')?.value;
  return c === sessionToken();
}
export async function ingestOk(req: Request) {
  const want = process.env.APEX_INGEST_TOKEN || '';
  if (!want) return true; // open ingest until a token is set (banner warns)
  const url = new URL(req.url);
  const got = req.headers.get('x-apex-token') || url.searchParams.get('token') || (await headers()).get('x-apex-token');
  return got === want;
}
