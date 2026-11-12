// The web app manifest (docs/design/07 s6). It makes the dashboard installable on a phone and a desktop. Colours come from the
// design tokens. The Halt shortcut only opens Today with the Halt button in focus: opening a link never halts anything.
import type { MetadataRoute } from 'next';
import { TOKENS } from '@apex/ui';

export const SHARE_ACTION = '/api/share';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Apex', short_name: 'Apex', id: '/', start_url: '/', scope: '/', display: 'standalone', orientation: 'any', lang: 'en', categories: ['finance', 'productivity'],
    description: 'Apex tests trading rules honestly and runs what passes in paper. Nothing here is proven or guaranteed.',
    background_color: TOKENS.bg.dark, theme_color: TOKENS.bg.dark,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
    shortcuts: [
      { name: 'Today', url: '/', description: 'What needs you, the last run and the paper book' },
      { name: 'New claim check', short_name: 'Claim check', url: '/claims', description: 'Test the rules a source states' },
      { name: 'Halt', url: '/#halt', description: 'Open Today with the Halt button ready. Nothing is halted until you press it' }],
    // Sharing text or a link from another app opens New claim check with the text filled in. Nothing runs until Plan is pressed.
    share_target: { action: SHARE_ACTION, method: 'POST', enctype: 'application/x-www-form-urlencoded', params: { title: 'title', text: 'text', url: 'url' } },
  };
}
