// The executor's signature on what it posts back to the dashboard (docs/design/02 s6, step 7). Red path.
// HMAC-SHA256 over "<timestamp>.<raw body>" with APEX_EXECUTOR_KEY. The executor signs, the fill route checks, and both use
// this one file. The key is never logged, stored or sent; only the signature travels.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const EXECUTOR_TS_HEADER = 'x-apex-timestamp', EXECUTOR_SIG_HEADER = 'x-apex-signature';
export const EXECUTOR_KEY_MIN = 32, EXECUTOR_MAX_SKEW_MS = 5 * 60e3;

/** Hex signature over "<timestamp>.<raw body>". `ts` is integer milliseconds, sent as written. */
export const signExecutor = (key: string, ts: string, body: string) => createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');

/** Fails closed: no key, a short key, a missing or stale timestamp, or a signature that does not match are all refused. */
export function verifyExecutor(key: string | undefined, ts: string | null, signature: string | null, body: string, now: number): { ok: true } | { ok: false; why: string } {
  if (typeof key !== 'string' || key.length < EXECUTOR_KEY_MIN) return { ok: false, why: 'the executor key is not set here' };
  if (typeof ts !== 'string' || !/^\d{1,16}$/.test(ts)) return { ok: false, why: 'the timestamp is missing' };
  if (!Number.isFinite(now) || Math.abs(now - Number(ts)) > EXECUTOR_MAX_SKEW_MS) return { ok: false, why: 'the timestamp is more than five minutes off' };
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, why: 'the signature does not match' };
  const want = Buffer.from(signExecutor(key, ts, body), 'hex'), got = Buffer.from(signature, 'hex');
  return timingSafeEqual(want, got) ? { ok: true } : { ok: false, why: 'the signature does not match' };
}
