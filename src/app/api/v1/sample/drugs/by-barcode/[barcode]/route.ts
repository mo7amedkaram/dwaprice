// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { drugsByBarcode } from '@/lib/api/routes';

export const GET = drugsByBarcode(true);
export const OPTIONS = corsPreflight;
