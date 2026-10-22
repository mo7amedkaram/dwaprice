import { NextResponse, type NextRequest } from 'next/server';
import { cleanQuery, searchDrugs } from '@/lib/data/search';

// Public search endpoint (the only data the browser can reach): read-only role,
// one parameterised call to web.search_drugs, query capped at 80 characters,
// top 10 products by default (`limit` up to 50: the search box asks for 50 for the
// first two characters while its local index is still loading, then filters locally).
// Short CDN caching: suggestions repeat a lot across users, and prices change at
// most a few times a day.
const LIMIT = 10;
const MAX_LIMIT = 50;
const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET(request: NextRequest) {
  const q = cleanQuery(request.nextUrl.searchParams.get('q'));
  if (!q) {
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': CACHE } });
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get('limit')) || LIMIT)));
  const started = performance.now();
  try {
    const results = await searchDrugs(q, limit);
    const db = performance.now() - started;
    const body = JSON.stringify({ results });
    // total = handler time (db + serialisation); the request parsing before this point is ~0.
    const total = performance.now() - started;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': CACHE,
        'Server-Timing': `total;dur=${total.toFixed(1)}, db;dur=${db.toFixed(1)}`,
      },
    });
  } catch (error) {
    console.error('search failed', error);
    return NextResponse.json({ results: [], error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
