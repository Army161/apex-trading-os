// What a live broker adapter must provide (docs/design/02 s6, 04 s10.2). Red path.
// No adapter exists: the venue is not chosen, and the adapter is written only when a slot reaches lock 3. Until then the only
// brokers here are the rehearsal below and the fake in the tests.
import type { Broker } from '@apex/autopilot/broker/types';
import type { GuardedIntent, OpenPosition } from '@apex/kernel/guard';

/** The answer to one bracket order. `stopResting` is true only when the venue confirms the hard stop is resting at the broker. */
export type BracketAck = {
  accepted: boolean; brokerOrderId: string; stopResting: boolean; why?: string;
  entry: { t: number; price: number; qty: number; fee: number } | null;     // the entry fill, once the venue reports it
};

/** One open order at the venue. A position counts as protected only by a stop on the opposite side covering its whole quantity. */
export type LiveOrder = { id: string; slotKey: string; kind: 'entry' | 'stop' | 'target'; side: 1 | -1; qty: number };

export interface LiveBroker extends Broker {
  /** The venue's own live switch, read from the adapter's own configuration. False means paper or unknown. */
  liveFlag(): boolean;
  /** Every client order id the venue knows for this account. The executor uses the intent id as the client order id. */
  clientOrderIds(): Promise<string[]>;
  /**
   * One bracket: the entry, plus a hard stop resting at the broker (and the target, if any). Resolves once the entry filled or was refused.
   * The intent id is the client order id, and the venue must reject a client order id it has already seen (accepted: false).
   */
  submitBracket(i: GuardedIntent): Promise<BracketAck>;
  /** Open orders with their kind, side and quantity, so step 4 can see that each position's stop covers it. */
  openOrders(): Promise<LiveOrder[]>;
  /** Cancel an order and anything it filled. True when the venue confirms. */
  cancel(brokerOrderId: string): Promise<boolean>;
  /** The venue's lot step and minimum quantity for a symbol. */
  lot(symbol: string, assetClass: string): { lotStep: number; minQty: number };
}

/** What the rehearsal reads when no adapter is installed: the live book from the ledger, and the paper capital as equity. */
export type Mirror = { positions: OpenPosition[]; openOrders: LiveOrder[]; equity: number };

/**
 * Rehearsal: records what would be sent and never sends. With an adapter it reads the account through it (positions, orders,
 * equity), but it never calls the adapter's submit, submitBracket or cancel. Without one it mirrors the live book.
 * Its live flag is always false, so it can never open lock 4.
 */
export class DryRunBroker implements LiveBroker {
  readonly id = 'rehearsal'; readonly mode = 'paper' as const; readonly rehearsal = true;
  readonly wouldSend: GuardedIntent[] = [];
  constructor(private o: { inner?: LiveBroker | null; mirror: Mirror }) {}
  get hasAdapter() { return !!this.o.inner; }
  liveFlag() { return false; }
  async submit(i: GuardedIntent) { this.wouldSend.push(i); return { id: i.id, accepted: false, duplicate: false }; }
  async onBar() { return []; }
  async positions() { return this.o.inner ? this.o.inner.positions() : this.o.mirror.positions; }
  async openOrders() { return this.o.inner ? this.o.inner.openOrders() : this.o.mirror.openOrders; }
  async equity() { return this.o.inner ? this.o.inner.equity() : this.o.mirror.equity; }
  async clientOrderIds() { return this.o.inner ? this.o.inner.clientOrderIds() : []; }
  async submitBracket(i: GuardedIntent): Promise<BracketAck> {
    this.wouldSend.push(i);
    return { accepted: false, brokerOrderId: 'rehearsal', stopResting: false, entry: null, why: 'rehearsal: recorded, not sent' };
  }
  async cancel() { return false; }
  lot(symbol: string, assetClass: string) { return this.o.inner ? this.o.inner.lot(symbol, assetClass) : { lotStep: 0.000001, minQty: 0.000001 }; }
}
