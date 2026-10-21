import { getSitemapFile, getSitemapFiles } from '@/lib/data/sitemap';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemap-xml';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getSitemapFiles()).map((f) => ({ file: f.file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const entries = await getSitemapFile(file);
  if (!entries) return new Response('Not found', { status: 404 });
  const xml = urlsetXml(entries.map((e) => ({ loc: absoluteUrl(e.path), lastmod: e.lastmod })));
  return new Response(xml, { headers: XML_HEADERS });
}
