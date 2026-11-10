// Paper ledger and bot state, saved to data/state.json so a restart keeps positions, the daily loss counter and muted wallets.
import fs from 'node:fs';
import path from 'node:path';
import type { Position, ClosedTrade } from './types.js';

const FILE = path.join(process.cwd(), 'data', 'state.json');
export type State = { cashSol: number; positions: Record<string, Position>; closed: ClosedTrade[]; bought: string[]; muted: Record<string, number>; day: string; dayPnlSol: number; paused: boolean };

export function load(bankroll: number): State {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { cashSol: bankroll, positions: {}, closed: [], bought: [], muted: {}, day: today(), dayPnlSol: 0, paused: false }; }
}
export function save(s: State) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(s, null, 1)); }
export const today = () => new Date().toISOString().slice(0, 10);
export function rollDay(s: State) { if (s.day !== today()) { s.day = today(); s.dayPnlSol = 0; } }

export function stats(s: State) {
  const pnl = s.closed.reduce((a, t) => a + t.pnlSol, 0), wins = s.closed.filter(t => t.pnlSol > 0).length;
  const openCost = Object.values(s.positions).reduce((a, p) => a + p.costSol - p.realizedSol, 0);
  return { cash_sol: +s.cashSol.toFixed(4), open_positions: Object.keys(s.positions).length, open_cost_sol: +openCost.toFixed(4), closed_trades: s.closed.length,
    realized_pnl_sol: +pnl.toFixed(4), win_rate: s.closed.length ? +(wins / s.closed.length).toFixed(3) : 0, day_pnl_sol: +s.dayPnlSol.toFixed(4), muted_wallets: Object.keys(s.muted).length, paused: s.paused };
}
