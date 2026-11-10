import { state } from '@/lib/state';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await state()); }
