import { COPY } from '@/lib/copy';
export const metadata = { title: 'Method' };

export default function Page() {
  const m = COPY.method;
  return <>
    <h1>{m.title}</h1>
    <p>{m.intro}</p>
    <h2>The seven checks</h2>
    <ol>{m.checks.map(c => <li key={c}>{c}</li>)}</ol>
    <h2>Counting tries</h2>
    <p>{m.tries}</p>
    <h2>Limits</h2>
    <p>{m.limits}</p>
  </>;
}
