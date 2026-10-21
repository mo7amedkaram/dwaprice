import { EnFooter, EnHeader } from '@/components/en/EnChrome';

// English chrome for /api/en/*: left-to-right, English header and footer.
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" lang="en" className="relative flex min-h-dvh flex-col overflow-x-clip">
      <a href="#main" className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        Skip to content
      </a>
      <EnHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <EnFooter />
    </div>
  );
}
