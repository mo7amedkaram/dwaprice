'use client';

// The sticky mobile search bar under the header. Hidden on the home page only (part 2): the
// home page already shows a large search box right under the header, so two stacked boxes would
// be redundant on phones. Every other page keeps this bar.
import { usePathname } from 'next/navigation';
import { SearchBox } from './SearchBox';
import { Container } from './ui';

export function HeaderMobileSearch() {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-bg/95 py-2 backdrop-blur md:hidden">
      <Container>
        <SearchBox id="site-search-mobile" />
      </Container>
    </div>
  );
}
