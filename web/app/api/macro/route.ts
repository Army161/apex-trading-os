import { macro } from '@/lib/assistants';
export async function GET() { return Response.json(await macro()); }
