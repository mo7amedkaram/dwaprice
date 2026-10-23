'use server';
// Form actions of /admin/comments and /admin/reports. Thin: the checks, SQL and cache refreshes
// live in ./moderation.ts (which answers 403 for a non-admin — these wrappers just stop there).
import { deleteComment, moderateComments, noteReport, replyToComment, setReportStatus } from './moderation';

export async function moderateCommentsAction(form: FormData): Promise<void> {
  await moderateComments(form);
}

export async function deleteCommentAction(form: FormData): Promise<void> {
  await deleteComment(form);
}

export async function replyToCommentAction(form: FormData): Promise<void> {
  await replyToComment(form);
}

export async function setReportStatusAction(form: FormData): Promise<void> {
  await setReportStatus(form);
}

export async function noteReportAction(form: FormData): Promise<void> {
  await noteReport(form);
}
