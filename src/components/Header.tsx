import Link from 'next/link';
import { SearchBox } from './SearchBox';
import { Container } from './ui';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { HeaderMobileSearch } from './HeaderMobileSearch';
import { routes } from '@/lib/site';

// "التصنيفات" is hidden below sm (the logo needs the room); the footer links it on every page.
const NAV = [
  { href: routes.categories(), label: 'التصنيفات', hideOnPhones: true },
  { href: routes.lastPrices(), label: 'أحدث الأسعار', hideOnPhones: false },
];

/**
 * Logo + nav; the search field sits inside the header from md up and in a
 * separate bar under it on mobile, which stays stuck to the top while scrolling.
 */
export function Header() {
  return (
    <>
      <header className="border-b border-border bg-bg">
        <Container className="flex min-h-16 items-center gap-3 md:gap-8">
          <Logo />
          <div className="hidden flex-1 md:block">
            <SearchBox id="site-search-desktop" />
          </div>
          <nav aria-label="القائمة الرئيسية" className="ms-auto md:ms-0">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href} className={item.hideOnPhones ? 'hidden sm:block' : undefined}>
                  <Link
                    href={item.href}
                    className="tap inline-flex items-center rounded-control px-2.5 font-medium whitespace-nowrap sm:px-3 text-text-2 transition-colors hover:bg-primary-tint hover:text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sm:hidden">
            <ThemeToggle variant="cycle" />
          </div>
          <div className="hidden sm:block">
            <ThemeToggle variant="group" />
          </div>
        </Container>
      </header>
      <HeaderMobileSearch />
    </>
  );
}
