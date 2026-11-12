// Lock 4's signature file (docs/design/02 s6). One file per slot, outside the repo, readable only by Jeremy's user. It holds
// the HMAC over one live_approval entry hash, never the key. A new approval needs a new signature.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SignatureFile = { slotKey: string; approvalSeq: number; approvalHash: string; stage: string; sizeCap: number; expiresAt: number; signature: string; signedAt: number };

export const signaturePath = (dir: string, slotKey: string) => join(dir, 'signatures', `${createHash('sha256').update(slotKey).digest('hex')}.json`);

/** The slot's signature file, or null when it is missing or cannot be read. */
export function readSignature(dir: string, slotKey: string): SignatureFile | null {
  const p = signaturePath(dir, slotKey); if (!existsSync(p)) return null;
  try {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    if (s?.slotKey !== slotKey || !Number.isSafeInteger(s.approvalSeq) || typeof s.approvalHash !== 'string' || typeof s.signature !== 'string' || !Number.isFinite(s.expiresAt)) return null;
    return s as SignatureFile;
  } catch { return null; }
}

export function writeSignature(dir: string, s: SignatureFile): string {
  const p = signaturePath(dir, s.slotKey); mkdirSync(join(dir, 'signatures'), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(s, null, 1) + '\n', { mode: 0o600 }); return p;
}
