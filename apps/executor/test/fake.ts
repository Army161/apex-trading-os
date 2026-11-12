// A fake live broker for the executor's tests. It can agree, disagree, refuse, drop the stop, or not answer. It never trades.
import type { GuardedIntent, OpenPosition } from '@apex/kernel/guard';
import type { BracketAck, LiveBroker, LiveOrder } from '../src/broker';

export type FakeOpts = {
  live: boolean; mode: 'paper' | 'live'; equity: number; positions: OpenPosition[]; orders: LiveOrder[]; clientIds: string[];
  stopResting: boolean; refuse: boolean; noAnswer: boolean; failReads: boolean; fillT: number; fillPrice: number; fee: number; lotStep: number; minQty: number;
};
export class FakeLiveBroker implements LiveBroker {
  id = 'fake'; get mode() { return this.o.mode ?? 'live'; }
  calls = { submit: 0, bracket: 0, cancel: 0 }; submitted: GuardedIntent[] = []; cancelled: string[] = [];
  constructor(public o: Partial<FakeOpts> = {}) {}
  liveFlag() { return this.o.live ?? true; }
  async submit(i: GuardedIntent) { this.calls.submit++; return { id: i.id, accepted: true, duplicate: false }; }
  async onBar() { return []; }
  private read<T>(x: T): T { if (this.o.failReads) throw new Error('venue unreachable'); return x; }
  async positions() { return this.read(this.o.positions ?? []); }
  async openOrders() { return this.read(this.o.orders ?? []); }
  async equity() { return this.read(this.o.equity ?? 10000); }
  async clientOrderIds() { return this.read(this.o.clientIds ?? []); }
  async submitBracket(i: GuardedIntent): Promise<BracketAck> {
    this.calls.bracket++; this.submitted.push(i);
    if (this.o.noAnswer) throw new Error('timeout');
    if (this.o.refuse) return { accepted: false, brokerOrderId: '', stopResting: false, entry: null, why: 'insufficient buying power' };
    return { accepted: true, brokerOrderId: `B-${this.calls.bracket}`, stopResting: this.o.stopResting ?? true, entry: { t: this.o.fillT ?? Date.now(), price: this.o.fillPrice ?? 100.05, qty: i.qty, fee: this.o.fee ?? 0.01 } };
  }
  async cancel(id: string) { this.calls.cancel++; this.cancelled.push(id); return true; }
  lot() { return { lotStep: this.o.lotStep ?? 0.000001, minQty: this.o.minQty ?? 0.000001 }; }
}
