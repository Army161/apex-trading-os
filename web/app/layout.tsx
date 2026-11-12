import '@apex/ui/tokens.css';
import '@apex/ui/ui.css';
import './globals.css';
import './shell.css';
import type { ReactNode } from 'react';
import { TOKENS } from '@apex/ui';
import Shell, { THEME_SCRIPT } from '@/components/shell/Shell';
import { shellStatus } from '@/lib/ledger';

export const metadata = { title: { default: 'Apex', template: '%s · Apex' }, description: 'Apex tests trading rules honestly and runs what passes in paper. Nothing here is proven or guaranteed.',
  applicationName: 'Apex', appleWebApp: { capable: true, title: 'Apex', statusBarStyle: 'black-translucent' as const }, icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }] } };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: dark)', color: TOKENS.bg.dark }, { media: '(prefers-color-scheme: light)', color: TOKENS.bg.light }] };
// The header shows live state (halts, tries counted), so no page is built ahead of time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const status = await shellStatus();
  return (
    <html lang="en" suppressHydrationWarning>
      {/* The theme script is the first thing in the body, not in a head of our own. The loader adds and removes its script tags
          in the head while the page is still being made live, and on a slow machine that broke the match between what the server
          sent and what the browser built (a page error on about 1 load in 13). Nothing of ours in the head means nothing to break. */}
      <body><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /><Shell initial={status}>{children}</Shell></body>
    </html>
  );
}
