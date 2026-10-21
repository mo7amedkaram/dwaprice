import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api/handler';
import { runJobs } from '@/lib/api/jobs';

// Scheduler entry point (every 15 minutes): "x-jobs-secret: $API_SECRET" or, for Vercel Cron,
// "Authorization: Bearer $CRON_SECRET". ?job=all|abuse|webhooks|cache (default all).
function authorized(req: NextRequest): boolean {
  const given = req.headers.get('x-jobs-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  for (const expected of [process.env.API_SECRET, process.env.CRON_SECRET]) {
    if (expected && expected.length >= 16 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return true;
  }
  return false;
}

async function handle(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return jsonResponse(401, { error: { code: 'unauthorized', message: 'jobs secret required', details: null } });
  const job = new URL(req.url).searchParams.get('job') ?? 'all';
  if (!['all', 'abuse', 'webhooks', 'cache'].includes(job)) return jsonResponse(400, { error: { code: 'validation_error', message: 'unknown job', details: null } });
  try {
    return jsonResponse(200, { ok: true, ran_at: new Date().toISOString(), ...(await runJobs(job)) }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('jobs failed', error);
    return jsonResponse(500, { ok: false, error: String((error as Error).message ?? error) });
  }
}

export const GET = handle;
export const POST = handle;
