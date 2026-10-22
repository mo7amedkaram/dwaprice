import { iconResponse } from '@/lib/settings/serve-icon';

// Dynamic favicon: the uploaded icon (admin › branding) or the built-in brand mark.
export const dynamic = 'force-dynamic';
export const GET = () => iconResponse('favicon.ico', 'image/x-icon');
