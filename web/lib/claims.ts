// Claim checker, the model step (docs/design/05 s3). The checker itself lives in packages/claims and never calls a model:
// this file hands it one that goes through the gateway, so the spend guard, the call log and the fallback apply.
// The answer is data. packages/claims checks every quote and number against the source before anything is tested.
import { extract, intake, type Extracted, type Intake, type ModelRequest } from '@apex/claims';
import { ask, textOf } from './gateway';
import { gate } from './policy';
import { ensureRoster } from './roster';

export const CLAIMS_MODEL = process.env.APEX_CLAIMS_MODEL || 'claude-fable-5-2';

/** One structured-output call. No tools, no history: the source text is the only user content. Throws on a refusal or a cut-off reply. */
export async function callExtractor(req: ModelRequest): Promise<unknown> {
  const r = await ask('claim-extract', { model: CLAIMS_MODEL, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } } });
  if (r.stop_reason === 'refusal') throw new Error('the model declined to read this source');
  if (r.stop_reason === 'max_tokens') throw new Error('the reply was cut off; the source may describe too much to extract in one go');
  return JSON.parse(textOf(r));
}

/** Intake, then extraction with one retry. A refused input never reaches the model. */
export async function extractClaims(text: unknown, kind: unknown = 'transcript'): Promise<{ ok: true; intake: Intake; extracted: Extracted } | { ok: false; error: string }> {
  const a = intake(text, kind); if (!a.ok) return a;
  // The extractor is an agent on the roster: its card, its daily budget and an audit row before the call (docs/design/06 s1).
  await ensureRoster(); const v = await gate({ agent: 'claim-extractor', verb: 'analyze', target: 'claim-check', trigger: 'person' });
  if (!v.allow) return { ok: false, error: v.rule === 'over-daily-budget' ? 'The claim extractor has used its jobs for today. Try again tomorrow.' : `The claim extractor was refused by the rule "${v.rule}".` };
  return { ok: true, intake: a.intake, extracted: await extract(a.intake, callExtractor) };
}
