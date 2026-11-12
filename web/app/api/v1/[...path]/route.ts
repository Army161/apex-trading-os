// /api/v1: the read-and-queue API (docs/design/09). All of it is served by lib/api/serve.ts from the contract in packages/sdk.
// The wiring to the real key store, session, ledger and the two writes is lib/api/deps.ts. There is no order, approve, resume or
// limit route here.
import { deps } from '@/lib/api/deps';
import { serve } from '@/lib/api/serve';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = (req: Request) => serve(req, deps);
export const POST = (req: Request) => serve(req, deps);
