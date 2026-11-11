import '@apex/ui/tokens.css';
import '@apex/ui/ui.css';
import './globals.css';
import './shell.css';
import type { ReactNode } from 'react';
import Shell, { THEME_SCRIPT } from '@/components/shell/Shell';
import { shellStatus } from '@/lib/ledger';

export const metadata = { title: { default: 'Apex', template: '%s · Apex' }, description: 'Apex tests trading rules honestly and runs what passes in paper. Nothing here is proven or guaranteed.' };
export const viewport = { width: 'device-width', initialScale: 1 };
// The header shows live state (halts, tries counted), so no page is built ahead of time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const status = await shellStatus();
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><Shell initial={status}>{children}</Shell></body>
    </html>
  );
}
