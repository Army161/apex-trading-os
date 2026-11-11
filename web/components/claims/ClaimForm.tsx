'use client';
// New claim check (docs/design/07 s4.10). Two steps: plan, which reads the source and counts the tries and writes nothing, and
// run, which uses those tries. A result is only ever shown after it has been counted.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ClaimExtraction, ClaimResult } from '@apex/claims';
import { count } from '@apex/ui';
import type { ClaimPlan } from '@/lib/claimrun';
import { ClaimResultView, Flags, RulesAsExtracted, VerdictBanner, type FlagNames } from './ClaimView';

const KINDS: [string, string][] = [['transcript', 'Transcript or notes'], ['pine', 'Pine script'], ['page', 'Sales page'], ['rules', 'List of rules']];
type Plan = { plan: ClaimPlan; extraction: ClaimExtraction | null; extractionErrors: string[] };
type Step = 'idle' | 'reading' | 'planned' | 'testing' | 'done';
const STEPS: [Step, string][] = [['reading', 'Reading and extracting rules'], ['planned', 'Plan ready'], ['testing', 'Testing'], ['done', 'Done']];

export default function ClaimForm({ triesSoFar, aiEnabled, signedIn, maxChars, names, notice }: { triesSoFar: number | null; aiEnabled: boolean; signedIn: boolean; maxChars: number; names: FlagNames; notice: string }) {
  const id = useId(), router = useRouter();
  const [text, setText] = useState(''), [kind, setKind] = useState('transcript'), [saved, setSaved] = useState(''), [step, setStep] = useState<Step>('idle'), [err, setErr] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null), [done, setDone] = useState<{ result: ClaimResult; seq: number | null } | null>(null);
  const busy = step === 'reading' || step === 'testing', at = STEPS.findIndex(s => s[0] === step);

  const post = async (body: object) => { const r = await fetch('/api/claims', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'The server refused the request.'); return j; };
  const change = (t: string) => { setText(t); if (plan || done) { setPlan(null); setDone(null); setStep('idle'); } };
  const onFile = async (f: File | undefined) => { if (!f) return; if (f.size > maxChars * 4) { setErr('That file is too large to check.'); return; } change(await f.text()); if (/\.pine$/i.test(f.name)) setKind('pine'); };
  const doPlan = async () => {
    setErr(''); setPlan(null); setDone(null); let extraction: unknown;
    if (saved.trim()) { try { extraction = JSON.parse(saved); } catch { setErr('The saved extraction is not valid JSON.'); return; } }
    setStep('reading');
    try { const j = await post({ text, kind, extraction, run: false }); setPlan({ plan: j.plan, extraction: j.extraction, extractionErrors: j.extractionErrors ?? [] }); setStep('planned'); }
    catch (e) { setErr((e as Error).message); setStep('idle'); }
  };
  const doRun = async () => {
    if (!plan) return; setErr(''); setStep('testing');
    try { const j = await post({ text, kind, extraction: plan.extraction ?? (saved.trim() ? JSON.parse(saved) : undefined), run: true }); setDone({ result: j.result, seq: j.seq }); setStep('done'); router.refresh(); }
    catch (e) { setErr((e as Error).message); setStep('planned'); }
  };
  const p = plan?.plan, fresh = p?.tries.fresh ?? 0;

  return <div className="grid">
    <section className="card">
      <label className="ax-label" htmlFor={`${id}-t`}>Paste a transcript, a Pine script, a sales page or a list of rules</label>
      <textarea id={`${id}-t`} className="ax-source" value={text} onChange={e => change(e.target.value)} rows={10} maxLength={maxChars} spellCheck={false} disabled={busy} />
      <div className="ax-filters">
        <label className="ax-pick"><span className="ax-label">What it is</span><select value={kind} onChange={e => { setKind(e.target.value); change(text); }} disabled={busy}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="ax-pick"><span className="ax-label">Or choose a text file</span><input type="file" accept=".txt,.md,.pine,text/plain" onChange={e => onFile(e.target.files?.[0])} disabled={busy} /></label>
        <button type="button" className="ax-btn" onClick={doPlan} disabled={busy || text.trim().length < 20}>{step === 'reading' ? 'Reading' : 'Read it and plan the check'}</button>
      </div>
      <p className="ax-n">{count(text.length)} of {count(maxChars)} characters. Planning uses no tries. {triesSoFar === null ? 'No ledger is connected, so a check cannot be run here.' : `Tries so far: ${count(triesSoFar)}.`} The text is read as data: nothing written in it is followed, and it is not stored.</p>
      {!signedIn && <p className="ax-n">You are not signed in, so the check will be refused. Log in under <a href="/you/setup">You, Setup</a>.</p>}
      <details className="ax-details"><summary>{aiEnabled ? 'Use a saved extraction instead of the model' : 'No model key is set: paste a saved extraction'}</summary>
        <label className="ax-label" htmlFor={`${id}-x`}>Extraction as JSON. It is checked against the text above: every quote must occur in it.</label>
        <textarea id={`${id}-x`} className="ax-source" value={saved} onChange={e => { setSaved(e.target.value); if (plan || done) { setPlan(null); setDone(null); setStep('idle'); } }} rows={5} spellCheck={false} disabled={busy} />
        <p className="ax-n">The terminal prints the request to give a model: <code>npm run apex -- claim &lt;file&gt; --request</code>.</p></details>
      {step !== 'idle' && <ol className="ax-steps" aria-label="Progress">{STEPS.map(([s, label], i) => <li key={s} data-state={i < at || step === 'done' ? 'done' : i === at ? 'now' : 'next'}><span aria-hidden="true">{i < at || step === 'done' ? '●' : i === at ? '◐' : '○'}</span> {label}</li>)}</ol>}
      <p className="ax-err" role="alert">{err}</p>
    </section>

    {plan && p && !done && <section className="card">
      <h2 className="ax-card-title">The plan: {p.title}</h2>
      {plan.extractionErrors.length > 0 && <><p>The extraction failed its checks, so no rules can be tested from it:</p><ul className="ax-list">{plan.extractionErrors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul></>}
      {p.headline ? <VerdictBanner verdict={p.waiting ? null : 'untestable'} headline={p.headline} /> : null}
      {p.readings.length > 0 && <div className="ax-scroll"><table className="ax-table"><caption>What will be run. No result is shown until it has been counted as a try</caption>
        <thead><tr><th scope="col">Reading</th><th scope="col">Runs as</th><th scope="col">Data</th><th scope="col">Counts as</th></tr></thead>
        <tbody>{p.readings.map((r, i) => <tr key={i}><th scope="row">{r.label}</th><td><code>{r.strategyId}</code></td><td>{r.data}{r.proxy ? <span className="ax-n"> {r.proxy}</span> : null}</td><td>{r.newTrial ? 'A new try' : 'Already tried, not counted again'}</td></tr>)}</tbody></table></div>}
      {p.untested.map((u, i) => <p key={i} className="ax-n">Will not be run, “{u.label}”: {u.missing.join('; ')}.</p>)}
      {plan.extraction?.ruleSets.map((rs, i) => <div key={i}><h3>The rules as extracted{plan.extraction!.ruleSets.length > 1 ? `: ${rs.name}` : ''}</h3><RulesAsExtracted x={plan.extraction!} index={i} /></div>)}
      {p.flags.length > 0 && <><h3>Flags</h3><Flags flags={p.flags} names={names} /></>}
      <p><strong>This will use {fresh} {fresh === 1 ? 'try' : 'tries'}.</strong> Tries so far: {count(p.tries.everAfter - (p.waiting ? 0 : fresh))}. Left this week: {p.tries.leftThisWeek}.</p>
      <div className="ax-pager"><button type="button" className="ax-btn" onClick={doRun} disabled={busy || p.waiting}>{step === 'testing' ? 'Testing' : p.waiting ? 'Waiting for the weekly budget' : p.readings.length ? `Run the check (uses ${fresh} ${fresh === 1 ? 'try' : 'tries'})` : 'Record it as could not be tested (uses 0 tries)'}</button></div>
      <p className="ax-n">Every reading that runs is written down first and stays in the ledger whatever it finds. That is what keeps the count of tries honest.</p>
    </section>}

    {done && <ClaimResultView r={done.result} names={names} notice={notice} seq={done.seq} />}
  </div>;
}
