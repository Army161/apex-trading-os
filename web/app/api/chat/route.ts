import { runChat } from '@/lib/chat';
import { isAdmin } from '@/lib/auth';
export const maxDuration = 120;
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ reply: 'AI chat is off: add ANTHROPIC_API_KEY in the Vercel project environment variables, then redeploy.' });
  const { messages } = await req.json();
  try { return Response.json(await runChat(messages, await isAdmin())); } catch (e: any) { return Response.json({ reply: e.message }); }
}
