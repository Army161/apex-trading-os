// The agents roster (docs/design/06 s2). This list is the roster: the stored copy is overwritten from it, so a card's verbs
// cannot be widened by editing the store. Its twin for the test is packages/kernel/test/roster.json.
// No agent has an order, pay, sign, send, delete or shell verb, and there is no verb that releases a halt.
import { roster, saveRoster, type Agent, type Verb } from './policy';

export type Card = Agent & { model: string; trigger: string; /** Where it runs today. "not built" means the card is a plan and nothing runs. */ runs: 'dashboard' | 'github' | 'not built'; note?: string };
const card = (id: string, purpose: string, tools: Verb[], model: string, jobsPerDay: number, trigger: string, runs: Card['runs'], note?: string): Card =>
  ({ id, role: id, project: 'apex', purpose, tools, jobsPerDay, tokenBudget: 200_000, approval: 'full', purposeFor: [...tools].sort().join(','), updated: 0, model, trigger, runs, note });

export const SEED: Card[] = [
  card('scout', 'Find new testable rules and turn them into research queue proposals with a draft pre-registration.', ['read', 'analyze', 'browse', 'write_file'], 'claude-sonnet-5-5', 3, 'Weekly digest, or a new archive entry', 'not built', 'Its fetch guard is built and tested. The job itself is not.'),
  card('claim-extractor', 'Step 2 of the claim checker: read a text and list the rules it states, with the words they came from.', ['analyze'], 'claude-fable-5-2', 30, 'A claim check', 'dashboard'),
  card('data-steward', 'Explain data problems in plain words and propose a fix. Code does the pulls.', ['read', 'analyze', 'notify', 'write_file'], 'claude-haiku-5-5', 24, 'Hourly data health', 'not built'),
  card('validator', 'Run the independent re-run. Code gives the verdict; a model only writes a note on a disagreement.', ['read', 'analyze', 'write_file'], 'claude-sonnet-5-5', 20, 'A pass waiting for validation, monthly, and before graduation', 'github', 'The re-run is a step of the nightly workflow. The note is not built.'),
  card('risk-officer', 'Read the book against its limits after a run and halt when a reading crosses its line. It cannot release a halt.', ['read', 'analyze', 'notify', 'halt'], 'none', 48, 'After every run', 'dashboard', 'The decision is a fixed rule, not a model. The report paragraph is not built.'),
  card('reporter', 'Turn a run\'s report data into the daily review, the weekly digest and the Telegram summary.', ['read', 'analyze', 'notify', 'write_file'], 'claude-sonnet-5-5', 4, 'Daily and weekly', 'not built', 'The nightly report is a fixed template with no model.'),
  card('code-reviewer', 'Review pull requests. Comment and suggest only.', ['read', 'analyze'], 'set in the review tool', 0, 'A pull request', 'not built', 'It would run in GitHub, so it has no job budget here.'),
  card('promotion-reviewer', 'The owner, engineer and QA review chain, run before a live approval can be offered.', ['read', 'analyze', 'write_file'], 'claude-fable-5-2', 2, 'A slot becomes eligible for live', 'not built', 'The review chain exists for strategy drafts. It is not yet tied to live eligibility.'),
];
const plain = ({ model: _m, trigger: _t, runs: _r, note: _n, ...a }: Card): Agent => a;

/** Make the stored roster match the seed for every seeded id. Agents added by other means are kept as they are. */
export async function ensureRoster(): Promise<Agent[]> {
  const have = await roster(), ids = new Set(SEED.map(a => a.id)), next = [...SEED.map(plain), ...have.filter(a => !ids.has(a.id))];
  if (JSON.stringify(next) !== JSON.stringify(have)) await saveRoster(next);
  return next;
}
