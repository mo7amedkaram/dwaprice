import { NextResponse, type NextRequest } from 'next/server';
import { redirectTarget } from '@/lib/data/slugs';
import { ENTITY_PREFIXES } from '@/lib/site';

// A live drug A-Z bucket: lower-case a–z, or the "0-9" bucket. Kept inline so the proxy bundle
// stays small (it must not pull in the listing logic). Matches lib/listing/logic.ts BROWSE_LETTERS.
const isLiveLetter = (x: string) => /^[a-z]$/.test(x) || x === '0-9';

// 301 for retired slugs (renamed products, merged ingredients; web.slugs history).
// Runs on the Node.js runtime (Next 16 proxy); the retired-slug map lives in
// memory and refreshes every 10 minutes, so requests normally never wait on the DB.
export async function proxy(request: NextRequest) {
  // api.<domain>/v1/* is served by the same handlers as /api/v1/* (docs/API_SPEC.md §2).
  const host = request.headers.get('host') ?? '';
  if (host.startsWith('api.') && request.nextUrl.pathname.startsWith('/v1')) {
    const url = request.nextUrl.clone();
    url.pathname = `/api${url.pathname}`;
    return NextResponse.rewrite(url);
  }
  const segments = request.nextUrl.pathname.split('/');

  // Drug A-Z: the English-letter pages are /adwiya/a … /adwiya/z and /adwiya/0-9 (lower case).
  // Serve those; 301 an upper-case letter to its lower-case form (keeping ?page=N); 301 the old
  // Arabic-letter URLs (and anything malformed) to the A-Z index — the Arabic→English initial has
  // no 1:1 mapping, so there is no per-letter target.
  if (segments[1] === 'adwiya' && segments[2]) {
    let raw: string;
    try {
      raw = decodeURIComponent(segments[2]);
    } catch {
      return NextResponse.redirect(new URL('/adwiya', request.url), 301); // malformed %-escape
    }
    const lower = raw.toLowerCase();
    if (isLiveLetter(lower)) {
      if (raw === lower) return NextResponse.next(); // the live page
      const url = request.nextUrl.clone(); // upper-case → lower-case, keep the query (?page=N)
      segments[2] = lower;
      url.pathname = segments.join('/');
      return NextResponse.redirect(url, 301);
    }
    return NextResponse.redirect(new URL('/adwiya', request.url), 301); // old Arabic letter → index
  }

  const type = ENTITY_PREFIXES[segments[1] as keyof typeof ENTITY_PREFIXES];
  const slug = segments[2];
  if (!type || !slug) return NextResponse.next();

  let current: string | null = null;
  try {
    current = await redirectTarget(type, decodeURIComponent(slug));
  } catch (error) {
    console.error('slug redirect lookup failed', error); // never block the page on this
  }
  if (!current) return NextResponse.next();

  const url = request.nextUrl.clone();
  segments[2] = current;
  url.pathname = segments.join('/');
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ['/dawa/:slug/:path*', '/active-ingredient/:slug', '/sharika/:slug', '/category/:slug', '/adwiya/:letter', '/v1/:path*'],
};
