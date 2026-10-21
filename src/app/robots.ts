import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // API and account pages only. Search results (/search?q=), filtered lists and
        // /design are noindex,follow through their meta tag: they must stay crawlable,
        // or the noindex is never read and their links are never followed.
        // /api/v1/* (the JSON API) and the admin pages carry nothing to index; /api, /api/en, /api/docs… are pages and stay allowed.
        disallow: ['/api/v1/', '/api/search', '/api/revalidate', '/admin/', '/account'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
