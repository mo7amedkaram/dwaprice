import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { isValidTag, tags } from '@/lib/cache';

// On-demand ISR: POST {"tags": ["drug:<slug>", "prices"]} or {"drugs": ["<slug>", ...]}
// with header "x-revalidate-secret: $REVALIDATE_SECRET". Marks the data stale
// (served stale while it re-renders on the next visit — revalidateTag "max").
function authorized(request: NextRequest): boolean {
  const expected = process.env.REVALIDATE_SECRET ?? '';
  const given = request.headers.get('x-revalidate-secret') ?? '';
  if (expected.length < 16 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { tags?: unknown; drugs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const requested = [
    ...(Array.isArray(body.tags) ? body.tags : []),
    ...(Array.isArray(body.drugs) ? body.drugs.map((slug) => (typeof slug === 'string' ? tags.drug(slug) : '')) : []),
  ].filter((t): t is string => typeof t === 'string');

  const valid = [...new Set(requested.filter(isValidTag))].slice(0, 500);
  for (const tag of valid) revalidateTag(tag, 'max');
  // A price change also changes the latest-prices list and the sitemap lastmod.
  if (valid.some((t) => t.startsWith('drug:'))) {
    revalidateTag(tags.prices, 'max');
    revalidateTag(tags.sitemap, 'max');
  }
  return NextResponse.json({ revalidated: valid, rejected: requested.length - valid.length });
}
