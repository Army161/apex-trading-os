// Canonical JSON (RFC 8785 style: sorted keys, shortest number form) and SHA-256. Every hash in the ledger goes through here.
// Numbers that are not integers are rounded to 10 significant digits first, so two machines whose floating-point maths
// differs in the last bits still agree on the hash (docs/design/04 s3.1). Non-finite numbers become null, as in JSON.
import { createHash } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function roundSig(x: number, sig = 10): number {
  if (!Number.isFinite(x)) return x;
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return x === 0 ? 0 : x;
  const r = Number(x.toPrecision(sig));
  return r === 0 ? 0 : r;
}

export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(roundSig(v)) : 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') throw new Error('canonicalJson: bigint is not allowed');
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v instanceof Map || v instanceof Set || v instanceof Date) throw new Error('canonicalJson: plain objects and arrays only');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter(k => o[k] !== undefined && typeof o[k] !== 'function').sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
  }
  throw new Error(`canonicalJson: cannot encode ${typeof v}`);
}

/** The value as it will be stored: exactly what was hashed, so a stored payload always re-hashes to its payloadHash. */
export const normalise = <T,>(v: T): T => JSON.parse(canonicalJson(v)) as T;
export const hashOf = (v: unknown) => sha256(canonicalJson(v));
