// What the header shows: mode, tries counted, halts, data status. Read only.
import { shellStatus } from '@/lib/ledger';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await shellStatus(), { headers: { 'cache-control': 'no-store' } }); }
