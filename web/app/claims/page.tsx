import { EmptyState } from '@apex/ui';
export const metadata = { title: 'Claim check' };
export default function Page() {
  return <EmptyState title="The claim check screen is not built yet" reason="The checker itself works: it reads a transcript, a script or a list of rules and tests the rules as stated with the same gate as everything else."
    next={<>Until this screen exists, run one from the terminal: <code>npm run apex -- claim &lt;file&gt; --extraction &lt;json&gt;</code>.</>} />;
}
