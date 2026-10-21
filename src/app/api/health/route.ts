import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Liveness + database check for the deploy script (scripts/server/deploy.sh) and uptime
// monitors: 200 {"ok":true,"commit":"<sha>"} when web_reader answers a trivial query.
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  const commit = process.env.COMMIT_SHA || null;
  try {
    await query('select 1');
    return NextResponse.json({ ok: true, commit }, { headers: HEADERS });
  } catch (error) {
    console.error('health check failed', error);
    return NextResponse.json({ ok: false, commit, error: 'database unavailable' }, { status: 503, headers: HEADERS });
  }
}
