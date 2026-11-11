import { readEnv } from '@/lib/env';
import { COPY } from '@/lib/copy';

export default function Page() {
  const stage = COPY.stage[readEnv().stage];
  return <>
    <h1>{COPY.tagline}</h1>
    <p>{COPY.what}</p>
    <p>{COPY.expect}</p>
    {stage && <p className="pf-stage" role="status">{stage}</p>}
    <h2>How it works</h2>
    <ol>{COPY.steps.map(([t, d]) => <li key={t}><strong>{t}.</strong> {d}</li>)}</ol>
  </>;
}
