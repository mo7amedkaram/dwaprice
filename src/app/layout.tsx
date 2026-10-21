import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { SITE, TITLE_SUFFIX } from '@/lib/site';
import { THEME_COLORS, THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

// Self-hosted by next/font at build time: only 400/500/600, swap, Arabic + Latin.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-arabic',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s${TITLE_SUFFIX}` },
  description: SITE.description,
  applicationName: SITE.name,
  formatDetection: { telephone: false },
  openGraph: { type: 'website', locale: SITE.locale, siteName: SITE.name },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the theme script adds data-theme to <html> before React hydrates.
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets the theme before the first paint (no flash); see src/lib/theme.ts. The site sends no CSP, so no nonce is needed. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Header, main and footer come from the route groups: (site) Arabic chrome, (en) English, (dev) by cookie. */}
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
