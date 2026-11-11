// The live switch: four locks (docs/design/02 s6). Red path. Nothing in this repo opens lock 4: that happens only in the
// executor on Jeremy's machine, which passes its own signature check in as `machine`.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type LockId = 'evidence' | 'validated' | 'approved' | 'machine';
export type Lock = { id: LockId; open: boolean; why: string };
export type LockFacts = {
  slotStatus: string;                                             // must be live_eligible or a live stage
  graduationPassedSeq: number | null;                             // seq of the passing graduation_check
  validatorAgreeSeq: number | null; reviewClean: boolean;         // fresh validator run after graduation, and the review chain
  approval: { seq: number; slotKey: string; stage: string; sizeCap: number; expiresAt: number; hash: string } | null;
  machine: { allowLive: boolean; signatureValid: boolean } | null; // null everywhere except the executor
};
const LIVE_OK = ['live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100'];

export function liveAllowed(slotKey: string, f: LockFacts, now: number): { allowed: boolean; locks: Lock[] } {
  const evidence = LIVE_OK.includes(f.slotStatus) && f.graduationPassedSeq !== null;
  const validated = evidence && f.validatorAgreeSeq !== null && f.validatorAgreeSeq > (f.graduationPassedSeq ?? Infinity) && f.reviewClean;
  const a = f.approval, approved = validated && !!a && a.slotKey === slotKey && a.expiresAt > now && a.seq > (f.validatorAgreeSeq ?? Infinity);
  const machine = approved && !!f.machine && f.machine.allowLive && f.machine.signatureValid;
  const locks: Lock[] = [
    { id: 'evidence', open: evidence, why: evidence ? 'forward paper record passed the strict gate' : 'the slot has not graduated from paper' },
    { id: 'validated', open: validated, why: validated ? 'fresh validator run agrees and the review chain is clean' : 'needs a fresh agreeing validator run and a clean review' },
    { id: 'approved', open: approved, why: approved ? `approved for ${a!.stage} until ${new Date(a!.expiresAt).toISOString().slice(0, 10)}` : 'needs Jeremy’s signed-in approval, made after the validator run and not expired' },
    { id: 'machine', open: machine, why: machine ? 'signed on Jeremy’s machine' : 'opens only on Jeremy’s own machine, with his key. There is no button for this' },
  ];
  return { allowed: locks.every(l => l.open), locks };
}

/** S1: every lock combination except all-open gives the paper broker. */
export function pickBroker<P, L>(allowed: { allowed: boolean }, paper: P, live: (() => L) | null): P | L {
  return allowed.allowed && live ? live() : paper;
}

export const signApproval = (key: string, approvalHash: string) => createHmac('sha256', key).update(`apex-live-approval|${approvalHash}`).digest('hex');
export function verifyApproval(key: string, approvalHash: string, signature: string) {
  if (!key || key.length < 32 || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signApproval(key, approvalHash), 'hex'), Buffer.from(signature, 'hex'));
}

export const STAGES = [{ id: 'micro_live', size: 0.01 }, { id: 'live_10', size: 0.1 }, { id: 'live_50', size: 0.5 }, { id: 'live_100', size: 1 }] as const;
