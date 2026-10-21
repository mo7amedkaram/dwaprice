import { NextResponse, type NextRequest } from 'next/server';
import { isLang, LANG_COOKIE } from '@/lib/api/lang';

// Language switch of the API section: remembers the choice (cookie, one year) and goes to
// the counterpart page given in ?next= (same-origin paths only).
/** `next` as a path on our origin, or null ("//host", "/\host", absolute URLs and anything the URL parser would send elsewhere). */
function sameOriginPath(next: string, origin: string): string | null {
  if (!/^\/(?![/\\])/.test(next)) return null;
  try {
    const u = new URL(next, origin);
    return u.origin === origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const url = new URL(req.url);
  const next = url.searchParams.get('next') ?? '';
  const res = NextResponse.redirect(new URL(sameOriginPath(next, url.origin) ?? (lang === 'en' ? '/api/en' : '/api'), url.origin), 302);
  if (isLang(lang)) res.cookies.set(LANG_COOKIE, lang, { path: '/', maxAge: 365 * 86_400, sameSite: 'lax', httpOnly: false });
  return res;
}
