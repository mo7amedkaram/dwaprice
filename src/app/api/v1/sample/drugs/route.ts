// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { drugsList } from '@/lib/api/routes';

export const GET = drugsList(true);
export const OPTIONS = corsPreflight;
