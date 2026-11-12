// Broker interface (docs/design/04 s10.2). Red path. A broker accepts only a GuardedIntent, which only the risk guard can make (S5).
import type { Bar } from '@apex/engine/core';
import type { GuardedIntent, OpenPosition } from '@apex/kernel/guard';

export type OrderAck = { id: string; accepted: boolean; duplicate: boolean };
export type Fill = { intent: string; slotKey: string; symbol: string; assetClass: string; side: 1 | -1; kind: 'entry' | 'stop' | 'trail' | 'target' | 'signal' | 'time' | 'cancelled';
  t: number; price: number; qty: number; fee: number; stop: number; target: number | null; mode: 'paper' | 'live'; note?: string };
export interface Broker {
  id: string; mode: 'paper' | 'live';
  submit(i: GuardedIntent): Promise<OrderAck>;          // idempotent on i.id
  onBar(symbol: string, bar: Bar): Promise<Fill[]>;     // paper: advances the simulator. live: no-op
  positions(): Promise<OpenPosition[]>; openOrders(): Promise<{ id: string; slotKey: string }[]>; equity(): Promise<number>;
}
