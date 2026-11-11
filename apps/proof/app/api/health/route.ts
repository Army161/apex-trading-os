import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';
export const dynamic = 'force-dynamic';

// Says only whether the settings are sound and which stage this is. It never lists a setting, set or not.
export async function GET() {
  const e = readEnv();
  return NextResponse.json({ ok: e.ok, stage: e.stage }, { status: e.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
