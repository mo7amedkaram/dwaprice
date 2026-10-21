// Language of the API section. Public pages are decided by their URL (/api/… Arabic,
// /api/en/… English); the dashboard and login pages read the "dw_lang" cookie, which the
// language switch sets through /api/lang/{ar|en}?next=… .
import { cookies } from 'next/headers';

export type Lang = 'ar' | 'en';
export const LANG_COOKIE = 'dw_lang';

export const isLang = (v: unknown): v is Lang => v === 'ar' || v === 'en';

/** Language cookie of the current request (dynamic pages only). */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'ar';
}

/** The same page in the other language of the public API section. */
export function counterpart(path: string, to: Lang): string {
  const en = path === '/api/en' || path.startsWith('/api/en/');
  if (to === 'en') return en ? path : path === '/api' ? '/api/en' : path.startsWith('/api/') ? `/api/en${path.slice(4)}` : path;
  return en ? (path === '/api/en' ? '/api' : `/api${path.slice(7)}`) : path;
}

/** Link that sets the cookie and lands on the counterpart page. */
export const switchHref = (currentPath: string, to: Lang): string => `/api/lang/${to}?next=${encodeURIComponent(counterpart(currentPath, to))}`;

/** Tiny dictionary helper: t({ ar, en }) */
export const pick = <T,>(lang: Lang, d: { ar: T; en: T }): T => d[lang];
