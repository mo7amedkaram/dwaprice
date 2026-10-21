import { Container, cx } from '../ui';
import { switchHref, type Lang } from '@/lib/api/lang';

export type ApiLang = Lang;

const LINKS: Record<Lang, Array<{ href: string; label: string }>> = {
  ar: [
    { href: '/api', label: 'نظرة عامة' },
    { href: '/api/sample', label: 'جرّب العينة' },
    { href: '/api/docs', label: 'التوثيق' },
    { href: '/api/request-access', label: 'طلب وصول' },
    { href: '/api/terms', label: 'شروط الترخيص' },
    { href: switchHref('/developer', 'ar'), label: 'لوحة المطورين' },
  ],
  en: [
    { href: '/api/en', label: 'Overview' },
    { href: '/api/en/sample', label: 'Try the sample' },
    { href: '/api/en/docs', label: 'Documentation' },
    { href: '/api/en/request-access', label: 'Request access' },
    { href: '/api/en/terms', label: 'License terms' },
    { href: switchHref('/developer', 'en'), label: 'Developer dashboard' },
  ],
};

/**
 * Secondary navigation of the API section (scrolls horizontally on phones). Every link stays
 * in the current language; the switch goes to the same page in the other language and
 * remembers the choice for the dashboard.
 */
export function ApiNav({ current, lang = 'ar' }: { current: string; lang?: Lang }) {
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  return (
    <div className="border-b border-border bg-surface" dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang}>
      <Container>
        <nav aria-label={lang === 'ar' ? 'أقسام الـ API' : 'API sections'} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex min-w-max items-center gap-1 py-1">
            {LINKS[lang].map((l) => {
              const active = l.href === current || (current === '/developer' && l.href.startsWith('/api/lang/'));
              return (
                <li key={l.href}>
                  <a
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'tap inline-flex items-center rounded-control px-3 font-medium whitespace-nowrap transition-colors',
                      active ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-primary-tint hover:text-primary',
                    )}
                  >
                    {l.label}
                  </a>
                </li>
              );
            })}
            <li className="ms-auto ps-2">
              <a href={switchHref(current, other)} hrefLang={other} lang={other} className="tap inline-flex items-center rounded-control border border-border px-3 font-medium text-ink hover:border-primary hover:text-primary">
                {other === 'en' ? 'English' : 'العربية'}
              </a>
            </li>
          </ul>
        </nav>
      </Container>
    </div>
  );
}
