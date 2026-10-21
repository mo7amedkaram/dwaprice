import { getSitemapFiles } from '@/lib/data/sitemap';
import { sitemapIndexXml, XML_HEADERS } from '@/lib/sitemap-xml';
import { absoluteUrl } from '@/lib/site';

// Sitemap index: one file per type, split at 45,000 URLs (see lib/data/sitemap.ts).
export const revalidate = 86400;

export async function GET() {
  const files = await getSitemapFiles();
  const xml = sitemapIndexXml(files.map((f) => ({ loc: absoluteUrl(`/sitemaps/${f.file}`), lastmod: f.lastmod })));
  return new Response(xml, { headers: XML_HEADERS });
}
