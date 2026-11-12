// Session rules (archive/chat/86). Our own code, paper only, UNPROVEN until they beat always-on trading in validation.
//  - skipMidday: no new entries in the New York midday lull (11:30 to 13:30 by default), the "amateur hour" he describes.
//  - The daily profit target and daily loss stop live in backtest() as the dayTarget / dayLoss options in core.ts.
import { Bar, Sig } from './core';
import { nyHM } from './ict';

export const skipMidday = (build: (b: Bar[]) => Sig, from = 690, to = 810) => (b: Bar[]): Sig => {
  const s = build(b);
  for (let i = 0; i < b.length - 1; i++) { const m = nyHM(b[i + 1].t); if (m >= from && m < to) { s.le[i] = false; s.se[i] = false; } }   // entry fills at the next open
  return s;
};
