import { SITE } from '@/lib/site';
import { THEME_COLORS } from '@/lib/theme';
import { getSiteSettings } from '@/lib/settings/read';

// Web app manifest (PWA icons + names). Icons point at the stable root routes, so they follow the
// current uploaded favicon. Name comes from the editable SEO settings where present.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { seo } = await getSiteSettings();
  const manifest = {
    name: SITE.name,
    short_name: SITE.name,
    description: seo.ogText,
    start_url: '/',
    display: 'standalone',
    lang: 'ar',
    dir: 'rtl',
    background_color: THEME_COLORS.light,
    theme_color: '#0D7C66',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
