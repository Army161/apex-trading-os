import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';

// Before any page or route: a deployment whose settings are refused (lib/env.ts) serves nothing but this one line.
// It runs in the Node runtime so that it sees the same environment the pages do. The health route answers for itself.
export const config = { runtime: 'nodejs', matcher: ['/((?!api/health$).*)'] };

let said = 0;
export function middleware() {
  const e = readEnv(); if (e.ok) return NextResponse.next();
  // Names of settings only, never a value, and at most once a minute.
  if (Date.now() - said > 60_000) { said = Date.now(); console.error(`[proof] not serving: ${e.problems.join(' ')}`); }
  return new NextResponse('This service is not set up correctly and is not serving. Its operator can read why in the server log.\n', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
