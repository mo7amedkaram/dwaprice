// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { ingredients } from '@/lib/api/routes';

export const GET = ingredients(true);
export const OPTIONS = corsPreflight;
