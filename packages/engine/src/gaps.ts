// Market-gap scan (archive/chat/75): map every registered strategy onto a grid of style x timeframe x direction, then list
// the empty cells and the archive ideas that have no strategy at all. A gap is a research lead, not an edge: anything built
// to fill one still has to pass validate.ts like every other rule.
import { STRATEGIES } from './strategies';

export const STYLES = ['trend', 'breakout', 'mean_reversion', 'reversal', 'sweep', 'pullback', 'score'] as const;
export type Style = typeof STYLES[number];
export const TF_BUCKETS = ['intraday', 'swing', 'daily'] as const;
export type TfBucket = typeof TF_BUCKETS[number];

/** Each registered strategy's main style. selftest fails if a new strategy is added without one. */
export const STYLE: Record<string, Style> = {
  turtle_55_20: 'breakout', sma50_trend: 'trend', rsi2_dip: 'mean_reversion', breakout_50_20: 'breakout', bb_squeeze: 'breakout',
  rsi_regime: 'trend', failure_test_2b: 'reversal', smc_sweep_lite: 'sweep', wyckoff_spring: 'reversal', confluence: 'score',
  supertrend: 'trend', golden_cross: 'trend', ict_turtle_soup: 'sweep', ict_silver_bullet: 'sweep', ict_unicorn: 'pullback',
  liq_trend_sweep: 'sweep', liq_reversal: 'reversal', liq_fx_levels: 'reversal', psar_reverse: 'trend', psar_adx: 'trend',
  sma_10_20: 'trend', ema50_bands: 'mean_reversion', ict_turtle_soup_ema: 'sweep', liq_reversal_ema: 'reversal',
  demand_second_leg: 'pullback', sharp_reversal_aoi: 'reversal', gws_reversal: 'reversal', anchor_discount: 'pullback',
  urban_deal_flow: 'pullback', urban_sr_memory: 'reversal', dave_swing_count: 'reversal', dave_prev_range: 'pullback', garch_vol_premium: 'mean_reversion', peak_extreme_fade: 'mean_reversion', peak_low_vol_reversal: 'mean_reversion', peak_dueling_momentum: 'trend', peak_stop_breakout: 'breakout',
  dave_prev_range__measured_move: 'pullback', dave_prev_range__close_break: 'pullback', dave_prev_range__macd_impulse: 'pullback', dave_prev_range__weak_stop: 'pullback',
  opening_range_breakout: 'breakout', vwap_trend_pullback: 'pullback', vwap_flat_fade: 'mean_reversion', momentum_candle_breakout: 'breakout', divergence_pivot: 'reversal',
};

export const bucket = (tf: string): TfBucket | null =>
  tf === 'any' ? null : /^\d+m$/.test(tf) || tf === '1h' ? 'intraday' : tf === '4h' ? 'swing' : 'daily';

/** Ideas the transcripts teach that no registered strategy uses yet (checked by hand against strategies.ts). */
export const UNUSED_IDEAS: { idea: string; source: string; note: string }[] = [
  { idea: 'Chart patterns: flags, double tops, head and shoulders', source: 'chat/08', note: 'measured-move targets' },
  { idea: 'Top-down timeframe filter (D/4H/30m)', source: 'chat/11', note: 'only some rules use a higher-timeframe filter today' },
  { idea: 'Order flow and footprint delta', source: 'uploads/10', note: 'needs tick or footprint data we do not have' },
  { idea: 'Futures session and roll effects', source: 'uploads/04', note: 'needs futures data' },
];

export type GapReport = {
  grid: Record<Style, Record<TfBucket, { long: string[]; both: string[] }>>;
  emptyCells: { style: Style; tf: TfBucket }[];
  longOnlyCells: { style: Style; tf: TfBucket }[];
  unstyled: string[];
  unusedIdeas: typeof UNUSED_IDEAS;
};

export function gapScan(list = STRATEGIES): GapReport {
  const grid = Object.fromEntries(STYLES.map(s => [s, Object.fromEntries(TF_BUCKETS.map(t => [t, { long: [] as string[], both: [] as string[] }]))])) as GapReport['grid'];
  const unstyled: string[] = [];
  for (const s of list) {
    const b = bucket(s.tf); if (!b) continue;
    const st = STYLE[s.id]; if (!st) { unstyled.push(s.id); continue; }
    grid[st][b][s.direction].push(s.id);
  }
  const emptyCells: GapReport['emptyCells'] = [], longOnlyCells: GapReport['longOnlyCells'] = [];
  for (const st of STYLES) for (const t of TF_BUCKETS) {
    const c = grid[st][t];
    if (!c.long.length && !c.both.length) emptyCells.push({ style: st, tf: t });
    else if (!c.both.length) longOnlyCells.push({ style: st, tf: t });
  }
  return { grid, emptyCells, longOnlyCells, unstyled, unusedIdeas: UNUSED_IDEAS };
}

export function gapMarkdown(r = gapScan()) {
  const cell = (c: { long: string[]; both: string[] }) => [...c.both, ...c.long.map(x => `${x} (long)`)].join(', ') || '**gap**';
  const rows = STYLES.map(s => `| ${s} | ${TF_BUCKETS.map(t => cell(r.grid[s][t])).join(' | ')} |`);
  return [
    '| Style | Intraday (1h and under) | Swing (4h) | Daily |', '|---|---|---|---|', ...rows, '',
    `**Empty cells (${r.emptyCells.length}):** ${r.emptyCells.map(c => `${c.style} / ${c.tf}`).join(', ') || 'none'}.`,
    `**Long only (${r.longOnlyCells.length}):** ${r.longOnlyCells.map(c => `${c.style} / ${c.tf}`).join(', ') || 'none'}.`, '',
    '**Ideas in the archive with no strategy yet:**', ...r.unusedIdeas.map(u => `- ${u.idea} (${u.source}): ${u.note}.`),
  ].join('\n');
}
