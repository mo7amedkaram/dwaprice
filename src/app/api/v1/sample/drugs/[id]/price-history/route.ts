// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { drugPriceHistory } from '@/lib/api/routes';

export const GET = drugPriceHistory(true);
export const OPTIONS = corsPreflight;
