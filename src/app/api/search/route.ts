import { NextResponse, type NextRequest } from 'next/server';
import { cleanQuery, searchDrugs } from '@/lib/data/search';

// Public search endpoint (the only data the browser can reach): read-only role,
// one parameterised call to web.search_drugs, query capped at 80 characters,
// top 10 products. Short CDN caching: suggestions repeat a lot across users,
// and prices change at most a few times a day.
const LIMIT = 10;
const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET(request: NextRequest) {
  const q = cleanQuery(request.nextUrl.searchParams.get('q'));
  if (!q) {
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': CACHE } });
  }
  const started = performance.now();
  try {
    const results = await searchDrugs(q, LIMIT);
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': CACHE, 'Server-Timing': `db;dur=${(performance.now() - started).toFixed(1)}` } },
    );
  } catch (error) {
    console.error('search failed', error);
    return NextResponse.json({ results: [], error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
