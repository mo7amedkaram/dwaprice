import { SITE } from '@/lib/site';

/** Public base URL of the API shown in docs and snippets (API_BASE_URL, else the site's /api/v1). */
export const apiPublicBase = (): string => process.env.API_BASE_URL?.replace(/\/$/, '') || `${SITE.url}/api/v1`;
