// Live stages after the locks open (docs/design/02 s6). Red path. No imports: the view and the screens use this in the browser.
export const STAGES = [{ id: 'micro_live', size: 0.01 }, { id: 'live_10', size: 0.1 }, { id: 'live_50', size: 0.5 }, { id: 'live_100', size: 1 }] as const;
