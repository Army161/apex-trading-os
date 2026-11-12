// API keys for /api/v1 (docs/design/09 s2). Red path: this file decides who may call the API.
//   A key is `apx_<id>_<secret>`. The secret is shown once, when the key is made. What is stored is
//   sha256(secret + APEX_API_KEYS_PEPPER), so a copy of the store does not give anyone a working key.
//   A key holds scopes from the contract and nothing else. There is no scope that approves, resumes, changes a limit or goes live.
//   With no pepper set, keys work only in local development. In production they are refused (fail closed, P0.6).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { openWithoutSecret } from '@apex/kernel/config';
import { SCOPES, type Scope } from '@apex/sdk/contract';
import { getJSON, setJSON } from '../store';

export type KeyRecord = { id: string; name: string; scopes: Scope[]; hash: string; created: number; lastUsed: number | null; revoked: number | null };
export type KeyInfo = Omit<KeyRecord, 'hash'>;
const STORE = 'apikeys', MAX_KEYS = 20, FORMAT = /^apx_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/, USED_EVERY_MS = 60_000;
const pepper = (env: NodeJS.ProcessEnv) => env.APEX_API_KEYS_PEPPER || '';
/** Keys can be made and checked: a pepper of 16 characters or more is set, or this is local development. */
export const keysUsable = (env: NodeJS.ProcessEnv = process.env) => pepper(env).length >= 16 || (!pepper(env) && openWithoutSecret(env.NODE_ENV === 'production'));
const hashOf = (secret: string, env: NodeJS.ProcessEnv) => createHash('sha256').update(secret + pepper(env)).digest('hex');
const info = ({ hash: _h, ...k }: KeyRecord): KeyInfo => k;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const cleanScopes = (x: unknown): Scope[] | null => {
  if (!Array.isArray(x) || !x.length) return null; const out = [...new Set(x)];
  return out.every(s => (SCOPES as readonly unknown[]).includes(s)) ? (SCOPES.filter(s => out.includes(s))) : null;
};
// The last-used time is kept beside the list, not in it, so noting a use can never write over a revoke that happened at the same moment.
const usedKey = (id: string) => `apikey_used:${id}`;
export async function listKeys(): Promise<KeyInfo[]> {
  const all = await getJSON<KeyRecord[]>(STORE, []);
  return Promise.all(all.map(async k => ({ ...info(k), lastUsed: await getJSON<number | null>(usedKey(k.id), null).catch(() => null) })));
}

/** Make a key. The full key is returned here once and never again. */
export async function createKey(name: unknown, scopes: unknown, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<{ ok: true; key: string; info: KeyInfo } | { ok: false; error: string }> {
  if (!keysUsable(env)) return { ok: false, error: 'APEX_API_KEYS_PEPPER is not set (16 characters or more), so keys cannot be made here.' };
  const label = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : ''; if (label.length < 2) return { ok: false, error: 'Give the key a name that says what will use it.' };
  const sc = cleanScopes(scopes); if (!sc) return { ok: false, error: `Pick at least one scope from: ${SCOPES.join(', ')}.` };
  const all = await getJSON<KeyRecord[]>(STORE, []); if (all.filter(k => !k.revoked).length >= MAX_KEYS) return { ok: false, error: `There are already ${MAX_KEYS} working keys. Revoke one first.` };
  const id = randomBytes(6).toString('hex'), secret = randomBytes(32).toString('base64url');
  const rec: KeyRecord = { id, name: label, scopes: sc, hash: hashOf(secret, env), created: now, lastUsed: null, revoked: null };
  await setJSON(STORE, [...all, rec]);
  return { ok: true, key: `apx_${id}_${secret}`, info: info(rec) };
}

/** Revoke a key. It stays in the list, marked revoked, so the record of it is kept. */
export async function revokeKey(id: string, now = Date.now()): Promise<boolean> {
  const all = await getJSON<KeyRecord[]>(STORE, []), k = all.find(x => x.id === id); if (!k) return false;
  if (!k.revoked) { k.revoked = now; await setJSON(STORE, all); }
  return true;
}

/** The key behind an `Authorization` header, or null. Unknown, malformed and revoked keys all read the same from outside. */
export async function verifyKey(header: string | null, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<KeyInfo | null> {
  const m = /^Bearer (\S+)$/.exec(header ?? ''), parts = m && FORMAT.exec(m[1]); if (!parts || !keysUsable(env)) return null;
  const all = await getJSON<KeyRecord[]>(STORE, []), k = all.find(x => x.id === parts[1]), got = hashOf(parts[2], env);
  if (!k) { same(got, got); return null; }
  if (!same(got, k.hash) || k.revoked) return null;
  const used = await getJSON<number | null>(usedKey(k.id), null).catch(() => null);
  if (!used || now - used > USED_EVERY_MS) await setJSON(usedKey(k.id), now).catch(() => {});
  return { ...info(k), lastUsed: now };
}
