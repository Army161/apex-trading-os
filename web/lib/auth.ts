import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { openWithoutSecret } from '@apex/kernel/config';
const PW = process.env.APEX_ADMIN_PASSWORD || '';
export const authEnabled = Boolean(PW);
export const sessionToken = () => crypto.createHash('sha256').update(`apex:${PW}`).digest('hex');
// Fail closed (P0.6): with no password set, admin actions are open only in local development. In production they are refused.
const PROD = process.env.NODE_ENV === 'production';
export async function isAdmin() {
  if (!authEnabled) return openWithoutSecret(PROD);
  const c = (await cookies()).get('apex_session')?.value;
  return c === sessionToken();
}
export async function ingestOk(req: Request) {
  const want = process.env.APEX_INGEST_TOKEN || '';
  if (!want) return openWithoutSecret(PROD); // no token: open in local development only, refused in production
  const url = new URL(req.url);
  const got = req.headers.get('x-apex-token') || url.searchParams.get('token') || (await headers()).get('x-apex-token');
  return got === want;
}
