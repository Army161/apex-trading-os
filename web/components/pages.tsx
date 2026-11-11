'use client';
// One small wrapper per route for the screens that predate the shell. Each fetches what its screen needs and nothing else.
import { FIXED } from '@apex/ui';
import { Command, Journal, Setup, useBots } from './screens';
import Strategies from './Strategies';
import Assistants from './Assistants';
import TraderRules from './Rules';
import { StateStrip, MemoryCard } from './Factory';

export function TodayPage() {
  const { state, load } = useBots();
  return <>
    <p className="ax-fixed">{FIXED.paper}</p>
    {state && !state.ingestTokenSet && <div className="banner warn">No APEX_INGEST_TOKEN is set, so bot reports are refused in production. Set one in the Vercel environment (see You, Setup).</div>}
    <StateStrip /><Command s={state} reload={load} />
  </>;
}
export function StrategiesPage() { const { state } = useBots(); return <Strategies aiEnabled={state?.aiEnabled} />; }
export function AssistantsPage() { const { state } = useBots(); return <Assistants aiEnabled={state?.aiEnabled} />; }
export function JournalPage() { const { state } = useBots(); return <><TraderRules /><MemoryCard /><Journal risk={state?.risk} /></>; }
export function SetupPage() { const { state } = useBots(); return <Setup s={state} />; }
