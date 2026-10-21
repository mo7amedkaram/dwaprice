import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { EnFooter, EnHeader } from '@/components/en/EnChrome';
import { getLang } from '@/lib/api/lang';

// Developer dashboard and its login: chrome follows the language cookie (set by the switch
// in the API section). These pages are dynamic anyway, so reading the cookie costs nothing.
export const dynamic = 'force-dynamic';

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  if (lang === 'en') {
    return (
      <div dir="ltr" lang="en" className="flex min-h-dvh flex-col">
        <EnHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <EnFooter />
      </div>
    );
  }
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
