// Generated from src/lib/api/routes.ts; keep thin.
import { corsPreflight } from '@/lib/api/handler';
import { drugAlternatives } from '@/lib/api/routes';

export const GET = drugAlternatives(true);
export const OPTIONS = corsPreflight;
