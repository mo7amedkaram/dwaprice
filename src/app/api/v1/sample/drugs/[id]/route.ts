// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { drugGet } from '@/lib/api/routes';

export const GET = drugGet(true);
export const OPTIONS = corsPreflight;
