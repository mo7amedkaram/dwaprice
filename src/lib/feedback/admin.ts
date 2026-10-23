import 'server-only';
// Admin reads of comments and reports (role api_app). Server components of /admin only.
import { apiQuery } from '@/lib/api/db';
import { COMMENT_STATUSES, REPORT_STATUSES, REPORT_TYPES, type CommentStatus, type ReportStatus, type ReportType } from './logic';

export interface AdminComment {
  id: string;
  drug_id: string;
  drug_slug: string;
  drug_name: string | null;
  name: string;
  email: string | null;
  body: string;
  is_pharmacist: boolean;
  status: CommentStatus;
  admin_reply: string | null;
  ip_hash: string;
  created_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
}

export type CommentFilter = CommentStatus | 'ALL';
export const parseCommentFilter = (v: unknown): CommentFilter => (typeof v === 'string' && (v === 'ALL' || (COMMENT_STATUSES as readonly string[]).includes(v)) ? (v as CommentFilter) : 'PENDING');

/** Comments by status (pending first when ALL), newest first. The drug name comes from the public view. */
export async function listComments(filter: CommentFilter, limit = 200): Promise<AdminComment[]> {
  return apiQuery<AdminComment>(
    `select c.id::text, c.drug_id::text, c.drug_slug, coalesce(d.name_ar, d.name_en) as drug_name, c.name, c.email, c.body, c.is_pharmacist,
            c.status, c.admin_reply, c.ip_hash, c.created_at, c.reviewed_by, c.reviewed_at
     from api.drug_comments c left join web.drug_cards d on d.drug_id = c.drug_id
     where ($1 = 'ALL' or c.status = $1)
     order by (c.status = 'PENDING') desc, c.created_at desc limit $2`,
    [filter, Math.min(Math.max(limit, 1), 500)],
  );
}

export interface AdminReport {
  id: string;
  drug_id: string;
  drug_slug: string;
  drug_name: string | null;
  current_price: string | null;
  type: ReportType;
  details: string;
  suggested_price: string | null;
  contact: string | null;
  status: ReportStatus;
  page_url: string | null;
  referrer: string | null;
  ip_hash: string;
  created_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  admin_note: string | null;
}

export type ReportFilter = ReportStatus | 'ALL';
export const parseReportFilter = (v: unknown): ReportFilter => (typeof v === 'string' && (v === 'ALL' || (REPORT_STATUSES as readonly string[]).includes(v)) ? (v as ReportFilter) : 'NEW');
export const parseReportType = (v: unknown): ReportType | 'ALL' => (typeof v === 'string' && (REPORT_TYPES as readonly string[]).includes(v) ? (v as ReportType) : 'ALL');

/** Reports by status and type, newest first, with the drug's current price for the side-by-side view. */
export async function listReports(filter: ReportFilter, type: ReportType | 'ALL', limit = 200): Promise<AdminReport[]> {
  return apiQuery<AdminReport>(
    `select r.id::text, r.drug_id::text, r.drug_slug, coalesce(d.name_ar, d.name_en) as drug_name, d.current_price::text as current_price,
            r.type, r.details, r.suggested_price::text as suggested_price, r.contact, r.status, r.page_url, r.referrer, r.ip_hash,
            r.created_at, r.reviewed_by, r.reviewed_at, r.admin_note
     from api.drug_reports r left join web.drug_cards d on d.drug_id = r.drug_id
     where ($1 = 'ALL' or r.status = $1) and ($2 = 'ALL' or r.type = $2)
     order by r.created_at desc limit $3`,
    [filter, type, Math.min(Math.max(limit, 1), 500)],
  );
}

export interface FeedbackCounts {
  pendingComments: number;
  newReports: number;
}

/** Sidebar badges + dashboard cards. Two index-only counts; never throws (0/0 on trouble). */
export async function getFeedbackCounts(): Promise<FeedbackCounts> {
  try {
    const rows = await apiQuery<{ c: string; r: string }>(
      "select (select count(*) from api.drug_comments where status = 'PENDING') c, (select count(*) from api.drug_reports where status = 'NEW') r",
    );
    return { pendingComments: Number(rows[0]?.c ?? 0), newReports: Number(rows[0]?.r ?? 0) };
  } catch {
    return { pendingComments: 0, newReports: 0 };
  }
}
