// Trader rules from the "grill me" interview (archive/chat/33): 20 questions, answers turned into a short rules file that
// Apex AI, Telegram chat and Risk Mitigator follow. House rules (paper first, 1% risk cap, a stop on every trade) always win.
import Anthropic from '@anthropic-ai/sdk';
import { getJSON, setJSON } from './store';
import { record, guard } from './usage';
import { MODEL } from './assistants';
import { ask } from './gateway';

export const QUESTIONS = [
  'What are you trading for right now: steady income, long-term growth, learning, or something else?',
  'How much of your account would you risk on one trade, as a percent?',
  'What loss in one day makes you stop trading for the day?',
  'What loss from your peak makes you pause a bot or a strategy?',
  'Which markets do you actually want to trade (crypto, US stocks, ETFs, prediction markets)?',
  'Which timeframes fit your day: minutes, hours, days or weeks?',
  'Which setups do you trust most so far, and why?',
  'What will you never trade (memecoins, leverage, penny stocks, earnings gambles)?',
  'Do you short? If yes, under what conditions?',
  'How do you handle big news days, earnings and Fed days?',
  'What reward-to-risk do you need before you take a trade?',
  'How do you take profits: one target, scale out in parts, or trail a stop?',
  'When do you move a stop, if ever?',
  'How many trades at once is too many for you?',
  'What usually happens right before your worst trades?',
  'After a loss, what should Apex make you do before the next trade?',
  'How much time a day can you watch markets?',
  'Which bot or strategy do you trust least right now, and what would earn your trust?',
  'When should Apex say "no trade" even if you want one?',
  'Anything else Apex should always or never do for you?',
] as const;

const HOUSE = 'House rules that always win: everything starts in paper mode; at most 1% of the account at risk per trade; every trade needs a stop, entry and target before it is placed; no keys in chat.';

/** Keeps the stored rules short and plain text. */
export function normalizeRules(t: string) { return String(t ?? '').replace(/<[^>]*>/g, '').replace(/\r/g, '').trim().slice(0, 4000); }
export const getRules = () => getJSON<{ text: string; ts: number } | null>('trader_rules', null);
export async function saveRules(text: string) { const r = { text: normalizeRules(text), ts: Date.now() }; await setJSON('trader_rules', r); return r; }

/** The block added to an AI tool's instructions; empty when no rules are saved, so prompts stay unchanged. */
export function rulesBlock(r: { text: string } | null) {
  return r?.text ? `\n\nJeremy's own trading rules (from his interview; follow them, but the house rules win on any conflict):\n${r.text}\n${HOUSE}` : '';
}

export async function draftRules(answers: string[]) {
  await guard();
  const qa = QUESTIONS.map((q, i) => `Q${i + 1}. ${q}\nA: ${String(answers[i] ?? '').slice(0, 600) || '(skipped)'}`).join('\n\n');
  const r = await ask('rules', { model: MODEL, max_tokens: 2000, output_config: { effort: 'medium' } as any,
    system: `Turn a trader's interview answers into a rules file an AI trading assistant will follow. Plain Markdown, short bullet rules under clear headings (Goals, Risk, Markets and timeframes, Setups, Never, Exits, Behaviour guards, When to say no). Under 400 words. Use his words where you can. Leave out anything he skipped. ${HOUSE} If an answer breaks a house rule (for example more than 1% risk), keep the house rule and add a line saying so.`,
    messages: [{ role: 'user', content: qa }] });
  if (r.stop_reason === 'refusal') throw new Error('the model declined');
  return normalizeRules(r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''));
}

// Red team (archive/chat/33): the Risk Mitigator argues against the trade like an investor who wants to pass.
export const RED_TEAM = `\n\nRED TEAM MODE: argue against this trade like a skeptical investor who wants to pass. Give the three strongest reasons not to
take it, with numbers from check_trade or get_market where you can. Then name the ONE specific, checkable thing that would change your mind
(a level, a close, a number). Still run check_trade first if the trade has numbers.`;
/** Risk Mitigator instructions: base, plus Jeremy's rules when saved, plus red-team mode when asked. */
export const riskSystem = (base: string, rules: { text: string } | null, redteam = false) => base + rulesBlock(rules) + (redteam ? RED_TEAM : '');
