import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// Arabic site chrome: every page of the website and the Arabic API pages.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        تخطَّ إلى المحتوى
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
