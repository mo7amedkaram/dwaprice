'use server';
// Public server actions behind the drug-page forms. They only read the request (address, user
// agent) and hand over to lib/feedback/submit.ts. CSRF: Next's same-origin check on server actions
// (Origin/Host must match) applies to every POST here, and nothing is written for a GET.
import { headers } from 'next/headers';
import { clientIp } from '@/lib/api/net';
import type { FeedbackFormState } from './logic';
import { submitComment, submitReport } from './submit';

async function context() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get('user-agent') };
}

export async function submitCommentAction(_prev: FeedbackFormState, form: FormData): Promise<FeedbackFormState> {
  return submitComment(form, await context());
}

export async function submitReportAction(_prev: FeedbackFormState, form: FormData): Promise<FeedbackFormState> {
  return submitReport(form, await context());
}
