// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { companies } from '@/lib/api/routes';

export const GET = companies(true);
export const OPTIONS = corsPreflight;
