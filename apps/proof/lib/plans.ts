// The plans and their limits (docs/design/12 s5). Prices are Jeremy's to set after the beta, so there are none here.
// Only limits that the claim check flow enforces today are listed. The others (export formats, the extension, the API,
// forward tracking, share links) join this table with the work package that builds each one.
export type Plan = 'free' | 'trader' | 'pro';
export type Limits = { checksPerMonth: number; interpretations: number; concurrent: number };
export const PLANS: Record<Plan, Limits> = {
  free: { checksPerMonth: 3, interpretations: 1, concurrent: 1 },
  trader: { checksPerMonth: 40, interpretations: 3, concurrent: 3 },
  pro: { checksPerMonth: 200, interpretations: 3, concurrent: 3 },
};
export const limitsOf = (plan: string): Limits => PLANS[(plan in PLANS ? plan : 'free') as Plan];
/** The usage period a moment falls in: the calendar month, in UTC, as the date of its first day. Billing (P5.4) replaces this with the subscription's own period for paid plans. */
export const periodStart = (now: number) => { const d = new Date(now); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };
/** The most new tries one account may write down in a week. Nobody on a plan can reach it by ordinary use: it is a ceiling against a runaway loop. */
export const triesPerWeek = (l: Limits) => l.checksPerMonth * l.interpretations;
