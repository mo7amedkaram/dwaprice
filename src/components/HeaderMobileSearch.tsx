'use client';

// The sticky mobile search bar under the header. Hidden on the home page only (part 2): the
// home page already shows a large search box right under the header, so two stacked boxes would
// be redundant on phones. Every other page keeps this bar. Under it, a slim NON-sticky strip holds
// the WhatsApp Channel button when one is configured — outside the sticky bar, so scrolling keeps
// only the search pinned and the search box itself never moves.
import { usePathname } from 'next/navigation';
import { SearchBox } from './SearchBox';
import { WhatsAppChannelButton } from './WhatsAppChannelButton';
import { Container } from './ui';

export function HeaderMobileSearch({ channel = '' }: { channel?: string }) {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-bg/95 py-2 backdrop-blur md:hidden">
        <Container>
          <SearchBox id="site-search-mobile" />
        </Container>
      </div>
      {channel && (
        <div className="border-b border-border bg-surface py-1.5 md:hidden">
          <Container className="flex justify-center">
            <WhatsAppChannelButton url={channel} placement="header" size="sm" className="border-transparent bg-transparent" />
          </Container>
        </div>
      )}
    </>
  );
}
