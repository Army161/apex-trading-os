// The app's map (docs/design/07 s2): six sections, each with its screens. One list, used by the rail, the bottom bar, the
// command palette, the sub-navigation and the browser check, so a screen cannot exist in one and be missing from another.
// Pure data: safe to import from client and server code.
import routes from './routes.json';

export type Screen = { href: string; label: string };
export type Section = { id: string; label: string; short: string; icon: string; href: string; screens: Screen[] };
export const SECTIONS: Section[] = routes.sections;
/** Phone bottom bar: these four, then "More" (07 s6). */
/** Pages that are not in any section's list, with the heading each one shows. */
export const UNLISTED: Record<string, string> = { '/receipts': 'Receipts' };
export const BOTTOM = ['today', 'autopilot', 'claims', 'agents'] as const;
export const ALL_SCREENS: (Screen & { section: string })[] = SECTIONS.flatMap(s => s.screens.map(x => ({ ...x, section: s.label })));

/** The section a path belongs to. "/" is Today only when it is the whole path. */
export function sectionOf(path: string): Section {
  const p = path.replace(/\/+$/, '') || '/';
  return SECTIONS.find(s => s.href !== '/' && (p === s.href || p.startsWith(`${s.href}/`))) ?? SECTIONS[0];
}
/** The screen a path shows: the longest screen href that the path starts with. */
export function screenOf(path: string): Screen | null {
  const p = path.replace(/\/+$/, '') || '/';
  return [...sectionOf(p).screens].sort((a, b) => b.href.length - a.href.length).find(x => p === x.href || p.startsWith(`${x.href}/`)) ?? null;
}
