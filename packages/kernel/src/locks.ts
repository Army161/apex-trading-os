// The live switch: four locks (docs/design/02 s6). Red path. Nothing in this repo opens lock 4: that happens only in the
// executor on Jeremy's machine, which passes its own signature check in as `machine`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LedgerEntry } from './ledger';
import type { LedgerView } from './view';

export type LockId = 'evidence' | 'validated' | 'approved' | 'machine';
export type Lock = { id: LockId; open: boolean; why: string };
export type LockFacts = {
  slotStatus: string;                                             // must be live_eligible or a live stage
  graduationPassedSeq: number | null;                             // seq of the passing graduation_check
  validatorAgreeSeq: number | null; reviewClean: boolean;         // fresh validator run after graduation, and the review chain
  reviewSeq?: number | null;                                      // seq of the latest promotion_review; an approval must come after it
  approval: { seq: number; slotKey: string; stage: string; sizeCap: number; expiresAt: number; hash: string } | null;
  machine: { allowLive: boolean; signatureValid: boolean } | null; // null everywhere except the executor
};
const LIVE_OK = ['live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100'];

export function liveAllowed(slotKey: string, f: LockFacts, now: number): { allowed: boolean; locks: Lock[] } {
  const evidence = LIVE_OK.includes(f.slotStatus) && f.graduationPassedSeq !== null;
  const validated = evidence && f.validatorAgreeSeq !== null && f.validatorAgreeSeq > (f.graduationPassedSeq ?? Infinity) && f.reviewClean;
  const a = f.approval, approved = validated && !!a && a.slotKey === slotKey && a.expiresAt > now && a.seq > (f.validatorAgreeSeq ?? Infinity)
    && (typeof f.reviewSeq !== 'number' || a.seq > f.reviewSeq);
  const machine = approved && !!f.machine && f.machine.allowLive && f.machine.signatureValid;
  const locks: Lock[] = [
    { id: 'evidence', open: evidence, why: evidence ? 'forward paper record passed the strict gate' : 'the slot has not graduated from paper' },
    { id: 'validated', open: validated, why: validated ? 'fresh validator run agrees and the review chain is clean' : 'needs a fresh agreeing validator run and a clean review' },
    { id: 'approved', open: approved, why: approved ? `approved for ${a!.stage} until ${new Date(a!.expiresAt).toISOString().slice(0, 10)}` : 'needs Jeremy’s signed-in approval, made after the validator run and the review, and not expired' },
    { id: 'machine', open: machine, why: machine ? 'signed on Jeremy’s machine' : 'opens only on Jeremy’s own machine, with his key. There is no button for this' },
  ];
  return { allowed: locks.every(l => l.open), locks };
}

export const REVIEW_STEPS = ['owner', 'engineer', 'qa'] as const;
export const REVIEW_VERDICTS = ['ok', 'concerns', 'block'] as const;
const isVerdict = (x: unknown) => (REVIEW_VERDICTS as readonly unknown[]).includes(x);
/** Every way a promotion_review payload can be malformed. Empty means it may be recorded. */
export function reviewShapeProblems(p: any): string[] {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['not an object'];
  const out: string[] = [], steps = Array.isArray(p.steps) ? p.steps : null;
  if (typeof p.slotKey !== 'string' || !p.slotKey) out.push('slotKey must be a string');
  if (typeof p.trialKey !== 'string' || !p.trialKey) out.push('trialKey must be a string');
  if (!Number.isSafeInteger(p.gradSeq) || p.gradSeq <= 0) out.push('gradSeq must be the seq of the graduation check it reviewed');
  if (!isVerdict(p.verdict)) out.push(`verdict must be one of ${REVIEW_VERDICTS.join(', ')}`);
  if (typeof p.by !== 'string' || !p.by) out.push('by must be a string'); if (typeof p.model !== 'string' || !p.model) out.push('model must be a string');
  if (!steps) out.push('steps must be a list');
  else for (const x of steps) if (!x || typeof x.step !== 'string' || !isVerdict(x.verdict) || !Array.isArray(x.issues)) { out.push('each step needs a name, a verdict and a list of issues'); break; }
  return out;
}

/**
 * Lock 2's review record. Clean only when the latest promotion_review for the slot was written after the passing graduation
 * check and after the agreeing validator run, names that graduation check and the slot's trial, covers the owner, engineer
 * and QA steps, and does not block. A step that blocks with a high-severity issue keeps it closed whatever the verdict says.
 */
export function reviewCleanOf(review: { seq: number; payload: any } | null, trialKey: string, gradSeq: number | null, agreeSeq: number | null): boolean {
  if (!review || gradSeq === null || agreeSeq === null || review.seq <= gradSeq || review.seq <= agreeSeq) return false;
  const p = review.payload; if (reviewShapeProblems(p).length) return false;
  if (p.gradSeq !== gradSeq || p.trialKey !== trialKey || (p.verdict !== 'ok' && p.verdict !== 'concerns')) return false;
  const steps: any[] = p.steps;
  if (!REVIEW_STEPS.every(id => steps.some(x => x.step === id))) return false;
  return !steps.some(x => x.verdict === 'block' && x.issues.some((i: any) => i?.severity === 'high'));
}

/**
 * The facts for locks 1 to 3, worked out from the ledger. The one place they are derived: the dashboard, the approval route,
 * the fill route and the executor all call this, so they cannot disagree. `machine` is always null here.
 */
export function lockFactsOf(v: LedgerView, entries: LedgerEntry[], slotKey: string): LockFacts {
  const s = v.slots.get(slotKey);
  if (!s) return { slotStatus: 'unknown', graduationPassedSeq: null, validatorAgreeSeq: null, reviewClean: false, reviewSeq: null, approval: null, machine: null };
  const g = s.lastGrad, gradSeq = g?.state === 'strict_pass' && Number.isSafeInteger(g.seq) ? g.seq as number : null;
  // The latest agreeing graduation re-run for this slot. A later graduation or monthly re-run that does not agree closes lock 2.
  const runs = (v.trials.get(s.trialKey)?.validator ?? []).filter(x => x.slotKey === slotKey), agree = runs.filter(x => x.purpose === 'graduation' && x.agrees === true).pop();
  const broken = !!agree && runs.some(x => (x.purpose === 'graduation' || x.purpose === 'monthly') && x.seq > agree.seq && x.agrees !== true);
  const agreeSeq = agree && !broken ? agree.seq as number : null;
  let review: LedgerEntry | undefined, ap: LedgerEntry | undefined;
  for (let i = entries.length - 1; i >= 0 && (!review || !ap); i--) { const e = entries[i];
    if (e.payload?.slotKey !== slotKey) continue;
    if (!review && e.kind === 'promotion_review') review = e; if (!ap && e.kind === 'live_approval') ap = e; }
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const approval = ap ? { seq: ap.seq, slotKey, stage: String(ap.payload.stage), sizeCap: num(ap.payload.sizeCap), expiresAt: num(ap.payload.expiresAt), hash: ap.hash } : null;
  return { slotStatus: s.status, graduationPassedSeq: gradSeq, validatorAgreeSeq: agreeSeq, reviewClean: reviewCleanOf(review ?? null, s.trialKey, gradSeq, agreeSeq),
    reviewSeq: review?.seq ?? null, approval, machine: null };
}

/** Locks 1 to 3 only, for a check made away from Jeremy's machine (lock 4 is never known there). */
export const serverLocksOpen = (slotKey: string, f: LockFacts, now: number) => liveAllowed(slotKey, { ...f, machine: null }, now).locks.filter(l => l.id !== 'machine').every(l => l.open);

/** S1: every lock combination except all-open gives the paper broker. */
export function pickBroker<P, L>(allowed: { allowed: boolean }, paper: P, live: (() => L) | null): P | L {
  return allowed.allowed && live ? live() : paper;
}

export const signApproval = (key: string, approvalHash: string) => createHmac('sha256', key).update(`apex-live-approval|${approvalHash}`).digest('hex');
export function verifyApproval(key: string, approvalHash: string, signature: string) {
  if (!key || key.length < 32 || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signApproval(key, approvalHash), 'hex'), Buffer.from(signature, 'hex'));
}

// The stages live in their own file with no imports, so screens that build the view never pull node:crypto into the browser.
export { STAGES } from './stages';
