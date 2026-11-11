import { type Inline, parseMarkdown } from '@/lib/markdown';

const Run = ({ x }: { x: Inline[] }) => <>{x.map((p, i) => p.t === 'code' ? <code key={i}>{p.s}</code> : p.t === 'strong' ? <strong key={i}>{p.s}</strong> : <span key={i}>{p.s}</span>)}</>;

/** A run report, drawn from parsed data. The report's own top heading becomes a second-level one, since the screen already has its h1. */
export default function Markdown({ text }: { text: string }) {
  return <div className="ax-md">{parseMarkdown(text).map((b, i) => {
    if (b.t === 'h') { const H = (b.level <= 2 ? 'h2' : 'h3') as 'h2' | 'h3'; return <H key={i} className={b.level <= 2 ? 'ax-card-title' : undefined}><Run x={b.inline} /></H>; }
    if (b.t === 'ul') return <ul key={i} className="ax-list">{b.items.map((it, j) => <li key={j}><Run x={it} /></li>)}</ul>;
    if (b.t === 'pre') return <pre key={i} className="ax-pre">{b.s}</pre>;
    if (b.t === 'table') return <div key={i} className="ax-scroll"><table className="ax-table"><thead><tr>{b.head.map((c, j) => <th key={j} scope="col"><Run x={c} /></th>)}</tr></thead>
      <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Run x={c} /></td>)}</tr>)}</tbody></table></div>;
    return <p key={i}><Run x={b.inline} /></p>;
  })}</div>;
}
