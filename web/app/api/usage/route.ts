// AI spend estimate for the last 14 days and the daily budget (lib/usage.ts).
import { recentUsage } from '@/lib/usage';
import { hubStats } from '@/lib/market';
export async function GET() { return Response.json({ ...(await recentUsage(14)), hub: hubStats() }); }
