// The small part of Markdown the run reports use, parsed into plain data. No HTML passes through: the screen builds elements from this,
// so report text can never become markup.
export type Inline = { t: 'text' | 'code' | 'strong'; s: string };
export type Block = { t: 'h'; level: number; inline: Inline[] } | { t: 'p'; inline: Inline[] } | { t: 'ul'; items: Inline[][] } | { t: 'table'; head: Inline[][]; rows: Inline[][][] } | { t: 'pre'; s: string };

export function inline(s: string): Inline[] {
  const out: Inline[] = [], re = /`([^`]+)`|\*\*([^*]+)\*\*/g; let at = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) { if (m.index > at) out.push({ t: 'text', s: s.slice(at, m.index) }); out.push(m[1] !== undefined ? { t: 'code', s: m[1] } : { t: 'strong', s: m[2] }); at = m.index + m[0].length; }
  if (at < s.length) out.push({ t: 'text', s: s.slice(at) });
  return out;
}
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n'), out: Block[] = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) { const body: string[] = []; i++; while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]); i++; out.push({ t: 'pre', s: body.join('\n') }); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l); if (h) { out.push({ t: 'h', level: h[1].length, inline: inline(h[2]) }); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) { const items: Inline[][] = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*[-*]\s+/, ''))); out.push({ t: 'ul', items }); continue; }
    if (l.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) { const head = cells(l), rows: Inline[][][] = []; i += 2; while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++])); out.push({ t: 'table', head, rows }); continue; }
    const para: string[] = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|```|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push({ t: 'p', inline: inline(para.join(' ')) });
  }
  return out;
}
