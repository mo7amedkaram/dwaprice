import Link from 'next/link';
import { Logo } from '../Logo';
import { ThemeToggle } from '../ThemeToggle';
import { Container } from '../ui';
import { SITE } from '@/lib/site';
import { switchHref } from '@/lib/api/lang';

const DEV = switchHref('/developer', 'en');

// English chrome for the English API pages and the dashboard in English: logo, a short nav,
// a plain footer. The Arabic site chrome (Header/Footer) stays on every other page.
const NAV = [
  { href: '/api/en', label: 'API' },
  { href: '/api/en/docs', label: 'Docs' },
  { href: '/api/en/sample', label: 'Sample' },
  { href: DEV, label: 'Dashboard' },
];

export function EnHeader() {
  return (
    <header className="border-b border-border bg-bg">
      <Container className="flex min-h-16 items-center gap-4">
        <Logo />
        <nav aria-label="Main" className="ms-auto">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href} className="hidden sm:block">
                <a href={item.href} className="tap inline-flex items-center rounded-control px-3 font-medium text-text-2 transition-colors hover:bg-primary-tint hover:text-primary">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link prefetch={false} href="/" hrefLang="ar" lang="ar" className="tap inline-flex items-center rounded-control border border-border px-3 font-medium whitespace-nowrap text-ink hover:border-primary hover:text-primary">
                <span className="sm:hidden">عربي</span>
                <span className="hidden sm:inline">الموقع بالعربية</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className="sm:hidden">
          <ThemeToggle variant="cycle" lang="en" />
        </div>
        <div className="hidden sm:block">
          <ThemeToggle variant="group" lang="en" />
        </div>
      </Container>
    </header>
  );
}

export function EnFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <Container className="grid gap-8 py-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="type-small max-w-md text-text-2">Egyptian drug prices, alternatives and active ingredients, from published sources. Information only; not medical advice.</p>
          <ThemeToggle variant="group" lang="en" className="mt-2" />
        </div>
        <nav aria-label="API">
          <h2 className="mb-2 font-semibold text-ink">API</h2>
          <ul>
            {[['/api/en', 'Overview'], ['/api/en/sample', 'Try the sample'], ['/api/en/docs', 'Documentation'], ['/api/en/request-access', 'Request access'], ['/api/en/terms', 'License terms'], [DEV, 'Developer dashboard']].map(([href, label]) => (
              <li key={href}><a href={href} className="tap inline-flex items-center text-text-2 hover:text-primary">{label}</a></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Site">
          <h2 className="mb-2 font-semibold text-ink">Site</h2>
          <ul>
            {[['/', 'Drug prices (Arabic)'], ['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']].map(([href, label]) => (
              <li key={href}><Link prefetch={false} href={href} className="tap inline-flex items-center text-text-2 hover:text-primary">{label}</Link></li>
            ))}
          </ul>
        </nav>
      </Container>
      <div className="border-t border-border">
        <Container className="type-small py-4 text-muted">© {new Date().getFullYear()} {SITE.name} — {SITE.domain}</Container>
      </div>
    </footer>
  );
}
