import { iconResponse } from '@/lib/settings/serve-icon';

export const dynamic = 'force-dynamic';
export const GET = () => iconResponse('apple-touch-icon.png', 'image/png');
