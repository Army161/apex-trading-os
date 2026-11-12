'use client';
import { useEffect, useState } from 'react';
import { utc } from '@apex/ui';
/** A time in the reader's own zone, with UTC on hover. The server renders UTC; the browser swaps it after it mounts. */
export default function LocalTime({ t, date }: { t: number; date?: boolean }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(new Date(t).toLocaleString([], date ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), [t, date]);
  return <time dateTime={new Date(t).toISOString()} title={utc(t)}>{local ?? (date ? utc(t).slice(0, 10) : utc(t))}</time>;
}
