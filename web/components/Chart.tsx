'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, UTCTimestamp } from 'lightweight-charts';
type Line = { name: string; color: string; data: { t: number; v: number }[] };
export default function Chart({ candles, lines = [], markers = [], height = 320 }: { candles?: { t: number; o: number; h: number; l: number; c: number }[]; lines?: Line[]; markers?: any[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const c = createChart(ref.current, { height, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css.getPropertyValue('--mute').trim() || '#888' },
      grid: { vertLines: { color: css.getPropertyValue('--line').trim() }, horzLines: { color: css.getPropertyValue('--line').trim() } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, autoSize: true });
    const ts = (t: number) => Math.floor(t / 1000) as UTCTimestamp;
    if (candles?.length) {
      const s = c.addCandlestickSeries({ upColor: '#2fd59b', downColor: '#ff6b6b', borderVisible: false, wickUpColor: '#2fd59b', wickDownColor: '#ff6b6b' });
      s.setData(candles.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
      if (markers.length) s.setMarkers(markers.map(m => ({ ...m, time: ts(m.time) })).sort((a, b) => a.time - b.time));
    }
    for (const l of lines) { const s = c.addLineSeries({ color: l.color, lineWidth: 2, title: l.name, priceLineVisible: false }); s.setData(l.data.filter(p => Number.isFinite(p.v)).map(p => ({ time: ts(p.t), value: p.v }))); }
    c.timeScale().fitContent();
    return () => c.remove();
  }, [candles, lines, markers, height]);
  return <div ref={ref} style={{ width: '100%', height }} />;
}
