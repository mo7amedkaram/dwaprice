// "تعليقات" at the bottom of a drug page: the approved comments (server-rendered — real content,
// newest first, plain text) and the submission form. A stable heading, no JSON-LD, and nothing
// here touches the page's title or description.
import { SectionTitle, Badge } from '../ui';
import { CommentForm } from './CommentForm';
import { getApprovedComments } from '@/lib/feedback/read';
import { formatDate, isoDate } from '@/lib/format';

export async function CommentsSection({ drugId, slug }: { drugId: string; slug: string }) {
  const comments = await getApprovedComments(drugId, slug);
  return (
    <section aria-labelledby="comments" id="comments-section">
      <SectionTitle id="comments">تعليقات{comments.length > 0 ? ` (${comments.length})` : ''}</SectionTitle>
      {comments.length > 0 ? (
        <ol className="mb-6 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-card border border-border bg-bg p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-ink">{c.name}</span>
                {c.is_pharmacist && <Badge tone="primary">صيدلي</Badge>}
                <time dateTime={isoDate(c.created_at) ?? undefined} className="type-small text-muted">
                  {formatDate(c.created_at)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-line text-ink">{c.body}</p>
              {c.admin_reply && (
                <div className="mt-3 rounded-control border-s-4 border-primary bg-primary-tint/50 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="primary">فريق الموقع</Badge>
                  </div>
                  <p className="whitespace-pre-line text-ink">{c.admin_reply}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-6 text-text-2">لا توجد تعليقات بعد. كن أول من يشارك تجربته مع هذا الدواء.</p>
      )}
      <h3 className="mb-3 font-semibold text-ink">أضف تعليقًا</h3>
      <CommentForm slug={slug} />
    </section>
  );
}
