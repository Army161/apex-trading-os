import { latestBriefs } from '@/lib/assistants';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ briefs: await latestBriefs(12) }); }
