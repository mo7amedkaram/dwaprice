import { iconResponse } from '@/lib/settings/serve-icon';

export const dynamic = 'force-dynamic';
export const GET = () => iconResponse('icon-192.png', 'image/png');
