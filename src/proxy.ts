import { NextResponse, type NextRequest } from 'next/server';
import { redirectTarget } from '@/lib/data/slugs';
import { ENTITY_PREFIXES } from '@/lib/site';

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
  matcher: ['/dawa/:slug/:path*', '/active-ingredient/:slug', '/sharika/:slug', '/category/:slug', '/v1/:path*'],
};
