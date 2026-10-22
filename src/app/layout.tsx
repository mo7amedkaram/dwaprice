import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { SITE } from '@/lib/site';
import { THEME_COLORS, THEME_SCRIPT } from '@/lib/theme';
import { INFO_LANG_SCRIPT } from '@/lib/info-lang';
import { getSiteSettings } from '@/lib/settings/read';
import { SiteAnalytics } from '@/components/SiteAnalytics';
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

// The title suffix, default description and icons come from the editable settings (admin area),
// so they change without a redeploy. Icons point at the stable root route handlers, which serve the
// uploaded favicon or the built-in brand mark.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteSettings();
  return {
    metadataBase: new URL(SITE.url),
    title: { default: SITE.name, template: `%s${seo.titleSuffix}` },
    description: seo.ogText,
    applicationName: SITE.name,
    formatDetection: { telephone: false },
    openGraph: { type: 'website', locale: SITE.locale, siteName: SITE.name },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      ],
      apple: [{ url: '/apple-touch-icon.png' }],
    },
    manifest: '/site.webmanifest',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { analytics } = await getSiteSettings();
  return (
    // suppressHydrationWarning: the head scripts add data-theme and data-info-lang to <html> before React hydrates.
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets the theme and the drug-info language before the first paint (no flash); see src/lib/theme.ts and src/lib/info-lang.ts. The site sends no CSP, so no nonce is needed. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INFO_LANG_SCRIPT }} />
      </head>
      {/* Header, main and footer come from the route groups: (site) Arabic chrome, (en) English, (dev) by cookie. */}
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink antialiased">
        {children}
        <SiteAnalytics measurementId={analytics.ga4MeasurementId} />
      </body>
    </html>
  );
}
