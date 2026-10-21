// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { priceChanges } from '@/lib/api/routes';

export const GET = priceChanges(true);
export const OPTIONS = corsPreflight;
