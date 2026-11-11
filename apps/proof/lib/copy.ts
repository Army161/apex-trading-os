// Every sentence the public pages show, in one place, so a test can hold all of it to the wording rules (docs/design/12 s7
// and s9): no promise of returns, none of the words Apex never uses about a source, and the not-advice line on every page.
export const NAME = 'Proof';
export const COPY = {
  tagline: 'Does this trading strategy actually work? Paste the rules and see them tested.',
  what: 'Proof reads a transcript, a Pine script or a sales page, writes down the exact rules it states, and tests those rules on historical data with the same seven checks every time. It shows what was claimed next to what was measured.',
  expect: 'Most checks come back "no edge". That is the expected answer, and a useful one before you pay for a bot, a course or a signal group.',
  steps: [
    ['Paste', 'A transcript, a Pine script or the text of a sales page. Proof does not fetch pages for you.'],
    ['Rules', 'The rules are extracted with the words they came from. Anything assumed is listed, and you can correct it.'],
    ['Test', 'Each reading of the rules is written down before it runs and counted as a try. Trying many versions marks the best one down.'],
    ['Verdict', 'One of a few fixed verdicts, with each check, the comparison against simply holding, and the data used.'],
  ] as [string, string][],
  never: 'Proof never sells signals, picks or managed money, never connects to a broker, and never ranks named vendors.',
  stage: { internal: 'Proof is not open yet. It is being tested internally, and there is no sign-up.', beta: 'Proof is in a private beta, by invitation.', paid: '' } as Record<string, string>,
  notAdvice: 'Proof tests rules on past data and reports statistics. It is not investment advice and it is not personal to you. A rule that held up on past data can stop working. Nothing here is a promise about the future.',
  placeholderName: 'Proof is a working name.',
  method: {
    title: 'How a check works',
    intro: 'The same method is used for every check, and it is fixed before the check runs.',
    checks: [
      'Enough trades to say anything at all.',
      'Better than random entries with the same number of trades.',
      'Still positive on the most recent part of the data alone.',
      'Still positive when every entry is one bar late.',
      'Still positive when costs are doubled.',
      'Costs take less than half of the gross profit.',
      'A better risk-adjusted result than holding the same market, with a positive return.',
    ],
    tries: 'Every version of a rule that is tested is counted. The more versions are tried, the more the best one is marked down, because the best of many tries is partly luck.',
    limits: 'A check uses historical bars and assumed costs. It cannot see the future, order-book detail or anything the source did not state. "Untestable" means the source did not state rules exact enough to test.',
  },
};
/** What the app says when it will not start a check, and the fixed line on a rule page. Held to the same wording test as the pages. */
export const MESSAGES = {
  notChecked: (why: string) => `Not checked: ${why}.`,
  noAccount: 'There is no account for this sign-in.',
  notActive: 'This account is not active, so nothing was run.',
  quota: (used: number, limit: number) => `This plan has ${limit} ${limit === 1 ? 'check' : 'checks'} a month and ${used} ${used === 1 ? 'is' : 'are'} used. Nothing was run and nothing was counted.`,
  busy: (n: number) => `This plan runs ${n} ${n === 1 ? 'check' : 'checks'} at a time. Wait for the one in progress to finish.`,
  tried: (n: number) => n === 1 ? 'You tried 1 version of this rule.' : `You tried ${n} versions of this rule. The best one is marked down for that.`,
};

/** Every fixed sentence, for the wording test. A sentence built from numbers is built once with sample numbers. */
export const allCopy = (): string[] => { const out: string[] = []; const walk = (x: unknown) => { if (typeof x === 'string') out.push(x); else if (typeof x === 'function') walk(x(2, 3)); else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(COPY); walk(MESSAGES); return out.filter(Boolean); };
