'use client';
// The app shell (docs/design/07 s2): header with the mode badge, the count of tries, the data status and Halt on every screen;
// the rail on desktop and the bottom bar on a phone; the command palette and the Apex AI drawer. The first status comes from
// the server with the page, then it is refreshed every 30 seconds.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banner, utc } from '@apex/ui';
import { ALL_SCREENS, BOTTOM, SECTIONS, screenOf, sectionOf } from '@/lib/nav';
import { DATA_MARK, DATA_WORDS, triesText, type ShellStatus } from '@/lib/status';
import { Ai } from '../screens';
import LocalTime from '../LocalTime';

type Theme = 'system' | 'light' | 'dark';
const THEMES: Theme[] = ['system', 'light', 'dark'];
const readTheme = (): Theme => { try { const t = localStorage.getItem('apex-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; } };
const applyTheme = (t: Theme) => { const el = document.documentElement; if (t === 'system') delete el.dataset.theme; else el.dataset.theme = t; try { localStorage.setItem('apex-theme', t); } catch { /* private window */ } };
/** Runs before the page paints, so a saved theme does not flash the other one first. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('apex-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function Shell({ initial, children }: { initial: ShellStatus; children: ReactNode }) {
  const path = usePathname() || '/', router = useRouter();
  const section = sectionOf(path), screen = screenOf(path);
  const [s, setS] = useState(initial);
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [aiOpen, setAiOpen] = useState(false);
  const palette = useRef<HTMLDialogElement>(null); const [q, setQ] = useState('');

  const refresh = useCallback(() => fetch('/api/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => j && setS(j)).catch(() => {}), []);
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => setTheme(readTheme()), []);
  const nextTheme = () => { const t = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; setTheme(t); applyTheme(t); };

  const openPalette = useCallback(() => { setQ(''); const d = palette.current; if (d && !d.open) d.showModal(); }, []);
  const closePalette = () => palette.current?.close();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.current?.open ? palette.current.close() : openPalette(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [openPalette]);

  const halt = useCallback(async () => {
    if (busy || s.halted) return; setBusy(true); setNote('');
    try {
      const r = await fetch('/api/halt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: `Halt pressed on ${screen?.label ?? path}` }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) setNote('Not halted: log in first, under You, Setup.');
      else if (!r.ok) setNote('Not halted: the server refused the request. Use `apex halt` in the terminal.');
      else { if (j.status) setS(j.status); setNote(j.ledger === 'recorded' ? 'Halted. Every bot is told to pause and the halt is in the ledger.'
        : j.ledger === 'failed' ? 'Bots are told to pause, but the halt could not be written to the ledger. Run `apex halt` in the terminal as well.'
          : 'Bots are told to pause. No ledger is connected here, so also run `apex halt` where the autopilot runs.'); }
    } catch { setNote('Not halted: the server could not be reached.'); } finally { setBusy(false); }
  }, [busy, s.halted, screen, path]);

  const hits = useMemo(() => { const n = q.trim().toLowerCase(); return ALL_SCREENS.filter(x => !n || `${x.section} ${x.label}`.toLowerCase().includes(n)); }, [q]);
  const go = (href: string) => { closePalette(); router.push(href); };
  const live = s.mode === 'live';

  return (
    <div className="ax-app" data-mode={s.mode} data-ai={aiOpen ? 'open' : undefined}>
      <a className="ax-skip" href="#main">Skip to the content</a>
      <header className="ax-header">
        <Link href="/" className="ax-brand" aria-label="Apex, go to Today">APEX</Link>
        <span className="ax-mode" data-tone={live ? 'live' : 'info'} data-testid="mode-badge">{live ? `LIVE: ${s.liveSlots.length} ${s.liveSlots.length === 1 ? 'slot' : 'slots'}` : 'PAPER'}</span>
        <span className="ax-head-facts">
          <Link href="/autopilot" className="ax-tries" data-testid="tries">{triesText(s)}</Link>
          <span className="ax-data" data-tone={DATA_MARK[s.data][1]} title={s.data === 'stale' ? `${s.dataStale.length} datasets are too old to open new paper orders until the next refresh.` : undefined}><span aria-hidden="true">{DATA_MARK[s.data][0]}</span> {DATA_WORDS[s.data]}{s.data === 'stale' ? ` (${s.dataStale.length})` : ''}</span>
        </span>
        <span className="ax-head-actions">
          <button type="button" className="ax-btn ax-search" onClick={openPalette} aria-keyshortcuts="Control+K Meta+K">Go to <kbd>Ctrl K</kbd></button>
          <button type="button" className="ax-btn" onClick={() => setAiOpen(o => !o)} aria-expanded={aiOpen} aria-controls="ax-ai">Ask Apex</button>
          <button type="button" className="ax-halt" onClick={halt} disabled={busy || s.halted} data-testid="halt">{s.halted ? 'Halted' : busy ? 'Halting' : 'Halt'}</button>
        </span>
      </header>

      <nav className="ax-rail" aria-label="Sections">
        <ul>{SECTIONS.map(x => <li key={x.id}><Link href={x.href} aria-current={x.id === section.id ? 'page' : undefined} title={x.label}><span className="ax-icon" aria-hidden="true">{x.icon}</span><span className="ax-rail-label">{x.label}</span></Link></li>)}</ul>
        <button type="button" className="ax-btn ax-theme" onClick={nextTheme} title="Switch between the system, light and dark themes"><span className="ax-icon" aria-hidden="true">◐</span><span className="ax-rail-label">Theme: {theme}</span></button>
      </nav>

      <main id="main" className="ax-main" tabIndex={-1}>
        <div aria-live="polite" className="ax-live">{note && <p className="ax-note">{note}</p>}</div>
        {s.halted && <Banner kind="halted">
          {s.halts.map((h, i) => <span key={i} className="ax-halt-row"><strong>{h.from === 'ledger' ? 'Autopilot' : 'Bots'}:</strong> {h.reason.replace(/[.\s]+$/, '')}. <span className="ax-n">Pulled by {h.by}{h.ts ? <>, <LocalTime t={h.ts} /></> : null}. {h.from === 'ledger'
            ? 'This halt is in the ledger and stays in force until you resume it on the Risk screen, with a typed confirmation.' : h.level === 'kill' ? 'Release the kill switch on Today.' : 'Release the andon cord on Today.'}</span></span>)}
          <span className="ax-n">Nothing new is opened while Apex is halted.</span>
        </Banner>}
        {s.data === 'blocked' && <Banner kind="data_blocked">{s.dataBlocked.join(', ')}. Figures that depend on these datasets are not to be trusted, and their slots are paused.</Banner>}
        {!s.persistent && <Banner kind="not_persistent">Bot history, the journal and agent jobs are kept in memory and reset when the server restarts. Add Upstash Redis from the Vercel Marketplace (see You, Setup).</Banner>}
        <div className="ax-pagehead">
          <h1>{screen?.label ?? section.label}</h1>
          {section.screens.length > 1 && <nav className="ax-subnav" aria-label={`${section.label} screens`}>
            {section.screens.map(x => <Link key={x.href} href={x.href} aria-current={x.href === screen?.href ? 'page' : undefined}>{x.label}</Link>)}</nav>}
        </div>
        {children}
      </main>

      <nav className="ax-bottom" aria-label="Sections">
        {SECTIONS.filter(x => (BOTTOM as readonly string[]).includes(x.id)).map(x => <Link key={x.id} href={x.href} aria-current={x.id === section.id ? 'page' : undefined}><span className="ax-icon" aria-hidden="true">{x.icon}</span>{x.short}</Link>)}
        <button type="button" onClick={openPalette} aria-current={(BOTTOM as readonly string[]).includes(section.id) ? undefined : 'page'}><span className="ax-icon" aria-hidden="true">⋯</span>More</button>
      </nav>

      <dialog ref={palette} className="ax-palette" aria-label="Go to a screen or run a safe command">
        <form onSubmit={e => { e.preventDefault(); if (hits[0]) go(hits[0].href); }}>
          <label className="ax-label" htmlFor="ax-q">Go to a screen</label>
          <input id="ax-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a screen name" autoComplete="off" />
        </form>
        <ul>{hits.map(x => <li key={x.href}><button type="button" onClick={() => go(x.href)}><span className="ax-n">{x.section}</span> {x.label}</button></li>)}
          {!hits.length && <li className="ax-n">No screen matches. Clear the box to see them all.</li>}</ul>
        <div className="ax-palette-actions">
          <button type="button" className="ax-halt" onClick={() => { closePalette(); halt(); }} disabled={busy || s.halted}>{s.halted ? 'Halted' : 'Halt'}</button>
          <button type="button" className="ax-btn" onClick={nextTheme}>Theme: {theme}</button>
          <button type="button" className="ax-btn" onClick={closePalette}>Close</button>
        </div>
      </dialog>

      {aiOpen && <aside id="ax-ai" className="ax-drawer" aria-label="Ask Apex">
        <div className="ax-drawer-head"><h2>Ask Apex</h2><button type="button" className="ax-btn" onClick={() => setAiOpen(false)}>Close</button></div>
        <p className="ax-n">It can explain and look things up. It cannot approve, resume or change a limit.</p>
        <Ai enabled={s.aiEnabled} />
      </aside>}
    </div>
  );
}
