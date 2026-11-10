// Public surface of the strategy engine. Imports nothing from the rest of the repo (dependency rule, docs/design/01 s4).
export * from './core';
export * from './validate';
export { STRATEGIES, byId, type StratDef } from './strategies';
export * from './stats/deflated';
export { strictGate, boardRow, dailyReturns, type BotLog, type PaperTrade, type BoardRow } from './leaderboard';
export { sharpeReport, correlation, weightsFor, PPY } from './sharpe';
export { resample } from './trend';
