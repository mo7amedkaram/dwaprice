import 'server-only';
// Admin writes for comments and reports. Every function re-checks the admin on the server and
// answers 403 for anyone else — the UI never decides. Kept apart from the 'use server' wrappers
// (./admin-actions.ts) so the 403 path and the SQL are unit-testable with mocks. Approving,
// rejecting, deleting or replying to a comment refreshes only that drug page's comments block
// (tag comments:<slug>), never the drug's price/alternatives loaders.
import { revalidatePath, revalidateTag } from 'next/cache';
import { apiQuery } from '@/lib/api/db';
import { tags } from '@/lib/cache';
import { currentAdmin } from '@/lib/api/current-admin';
import { COMMENT_STATUSES, REPORT_STATUSES, cleanText, type CommentStatus, type ReportStatus } from './logic';

export interface ModerationResult {
  ok: boolean;
  /** 200 done · 400 bad input · 403 not an active admin */
  status: 200 | 400 | 403;
}

const ID_RE = /^\d{1,18}$/;
const ids = (form: FormData, name: string): string[] => form.getAll(name).map(String).filter((v) => ID_RE.test(v)).slice(0, 500);
const forbidden: ModerationResult = { ok: false, status: 403 };
const bad: ModerationResult = { ok: false, status: 400 };
const done: ModerationResult = { ok: true, status: 200 };

async function refreshComments(commentIds: string[]): Promise<void> {
  if (commentIds.length === 0) return;
  const rows = await apiQuery<{ drug_slug: string }>('select distinct drug_slug from api.drug_comments where id = any($1::bigint[])', [commentIds]);
  for (const r of rows) revalidateTag(tags.comments(r.drug_slug), 'max');
  revalidatePath('/admin/comments');
  revalidatePath('/admin');
}

/** APPROVED / REJECTED / SPAM for one or many comments (ids from `id` and `ids`). */
export async function moderateComments(form: FormData): Promise<ModerationResult> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const status = String(form.get('status') ?? '') as CommentStatus;
  const list = [...ids(form, 'id'), ...ids(form, 'ids')];
  if (!COMMENT_STATUSES.includes(status) || status === 'PENDING' || list.length === 0) return bad;
  // Slugs are read before the update so a comment leaving APPROVED still refreshes its page.
  const slugs = await apiQuery<{ drug_slug: string }>('select distinct drug_slug from api.drug_comments where id = any($1::bigint[])', [list]);
  await apiQuery('update api.drug_comments set status = $2, reviewed_by = $3, reviewed_at = now() where id = any($1::bigint[])', [list, status, admin.email]);
  for (const r of slugs) revalidateTag(tags.comments(r.drug_slug), 'max');
  revalidatePath('/admin/comments');
  revalidatePath('/admin');
  return done;
}

export async function deleteComment(form: FormData): Promise<ModerationResult> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const list = ids(form, 'id');
  if (list.length === 0) return bad;
  const rows = await apiQuery<{ drug_slug: string }>('delete from api.drug_comments where id = any($1::bigint[]) returning drug_slug', [list]);
  for (const r of rows) revalidateTag(tags.comments(r.drug_slug), 'max');
  revalidatePath('/admin/comments');
  revalidatePath('/admin');
  return done;
}

/** Write or clear the site's official reply (shown under an approved comment with the «فريق الموقع» badge). */
export async function replyToComment(form: FormData): Promise<ModerationResult> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const list = ids(form, 'id');
  if (list.length !== 1) return bad;
  const reply = cleanText(form.get('reply'), 2000);
  await apiQuery('update api.drug_comments set admin_reply = $2, reviewed_by = coalesce(reviewed_by, $3) where id = $1', [list[0], reply || null, admin.email]);
  await refreshComments(list);
  return done;
}

export async function setReportStatus(form: FormData): Promise<ModerationResult> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const status = String(form.get('status') ?? '') as ReportStatus;
  const list = ids(form, 'id');
  if (!REPORT_STATUSES.includes(status) || list.length === 0) return bad;
  await apiQuery('update api.drug_reports set status = $2, reviewed_by = $3, reviewed_at = now() where id = any($1::bigint[])', [list, status, admin.email]);
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return done;
}

export async function noteReport(form: FormData): Promise<ModerationResult> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const list = ids(form, 'id');
  if (list.length !== 1) return bad;
  const note = cleanText(form.get('note'), 2000);
  await apiQuery('update api.drug_reports set admin_note = $2, reviewed_by = coalesce(reviewed_by, $3) where id = $1', [list[0], note || null, admin.email]);
  revalidatePath('/admin/reports');
  return done;
}
