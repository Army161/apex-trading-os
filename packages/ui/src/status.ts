// One status vocabulary for the web, the terminal, Telegram and reports (docs/design/07 s3.4). A status is always a label and a
// shape as well as a colour, so it reads without colour. `--live` belongs to live states and nothing else.
export type Tone = 'mute' | 'warn' | 'info' | 'acc' | 'live' | 'bad';
export type StatusDef = { label: string; shape: string; shapeName: string; tone: Tone };
export const STATUS = {
  rejected: { label: 'No edge', shape: '⊗', shapeName: 'cross in a circle', tone: 'mute' },
  watch: { label: 'Near miss', shape: '◐', shapeName: 'half-filled circle', tone: 'warn' },
  needs_data: { label: 'Needs data', shape: '⧖', shapeName: 'hourglass', tone: 'info' },
  passed_pending_validation: { label: 'Checking', shape: '⇄', shapeName: 'two arrows', tone: 'info' },
  paper: { label: 'Paper', shape: '○', shapeName: 'hollow circle', tone: 'acc' },
  paused: { label: 'Paused', shape: '‖', shapeName: 'pause bars', tone: 'warn' },
  live_eligible: { label: 'Eligible', shape: '✓', shapeName: 'tick in a circle', tone: 'acc' },
  micro_live: { label: 'LIVE 1%', shape: '◆', shapeName: 'solid diamond', tone: 'live' },
  live_10: { label: 'LIVE 10%', shape: '◆', shapeName: 'solid diamond', tone: 'live' },
  live_50: { label: 'LIVE 50%', shape: '◆', shapeName: 'solid diamond', tone: 'live' },
  live_100: { label: 'LIVE 100%', shape: '◆', shapeName: 'solid diamond', tone: 'live' },
  retired: { label: 'Retired', shape: '■', shapeName: 'square', tone: 'mute' },
  shadow: { label: 'Shadow', shape: '◌', shapeName: 'dashed circle', tone: 'mute' },
} as const satisfies Record<string, StatusDef>;
export type StatusId = keyof typeof STATUS;
/** Claim-check verdicts. A pass on past data is shown as "checking" blue, never as the green of something that is running. */
export const VERDICT_STATUS: Record<'holds_up' | 'near_miss' | 'no_edge' | 'untestable', StatusDef> = {
  holds_up: { label: 'Holds up on past data', shape: '⇄', shapeName: 'two arrows', tone: 'info' },
  near_miss: { label: 'Near miss', shape: '◐', shapeName: 'half-filled circle', tone: 'warn' },
  no_edge: { label: 'No edge found', shape: '⊗', shapeName: 'cross in a circle', tone: 'mute' },
  untestable: { label: 'Could not be tested', shape: '⧖', shapeName: 'hourglass', tone: 'info' },
};
/** A status id from the ledger, or a paused state that carries its reason ("paused_drift", "paused_data"). An unknown id is
 *  shown as its own text with a question mark, never as a guess at one of the known ones. */
export function statusOf(id: string): StatusDef {
  if (Object.prototype.hasOwnProperty.call(STATUS, id)) return STATUS[id as StatusId];
  if (id.startsWith('paused')) return STATUS.paused;
  return { label: id.replace(/_/g, ' '), shape: '?', shapeName: 'question mark', tone: 'mute' };
}
