import '@apex/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { guard } from '@/lib/env';
import { COPY, NAME } from '@/lib/copy';

export const metadata = { title: { default: NAME, template: `%s · ${NAME}` }, description: COPY.tagline };
export const viewport = { width: 'device-width', initialScale: 1 };
// The settings are checked on every request, so a deployment that is wired wrongly serves nothing at all.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  guard();
  return (
    <html lang="en" data-theme="light">
      <body><div className="pf-wrap">
        <header className="pf-head"><Link className="pf-name" href="/">{NAME}</Link><nav aria-label="Pages"><Link href="/method">Method</Link></nav></header>
        <main>{children}</main>
        <footer className="pf-foot"><p>{COPY.notAdvice}</p><p>{COPY.never} {COPY.placeholderName}</p></footer>
      </div></body>
    </html>
  );
}
