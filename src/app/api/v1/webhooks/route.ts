import { createWebhook, listWebhooks } from '@/lib/api/webhooks';

export const GET = listWebhooks;
export const POST = createWebhook;
