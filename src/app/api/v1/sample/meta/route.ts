// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { metaEndpoint } from '@/lib/api/routes';

export const GET = metaEndpoint(true);
export const OPTIONS = corsPreflight;
