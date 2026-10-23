import 'server-only';
// Public read of a drug page's comments: APPROVED rows only, through the web.drug_comments view with
// the read-only role (the view exposes no e-mail, IP hash, user agent or status — see migration
// 0052). Cached under comments:<slug> so moderation refreshes just this block, not the drug's data.
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { REVALIDATE_SECONDS, tags } from '@/lib/cache';

export interface PublicComment {
  id: string;
  name: string;
  body: string;
  is_pharmacist: boolean;
  admin_reply: string | null;
  created_at: string;
}

/** Up to 200 approved comments of the drug, newest first. Never throws (a database hiccup shows no comments). */
export function getApprovedComments(drugId: string, slug: string): Promise<PublicComment[]> {
  return unstable_cache(
    async () => {
      try {
        // created_at as ISO text: unstable_cache serialises the value, and a Date would come back a string anyway.
        const rows = await query<PublicComment>(
          `select id::text, name, body, is_pharmacist, admin_reply, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
           from web.drug_comments where drug_id = $1 order by created_at desc limit 200`,
          [drugId],
        );
        return rows;
      } catch {
        return [];
      }
    },
    ['drug-comments-v1', drugId],
    { revalidate: REVALIDATE_SECONDS, tags: [tags.comments(slug)] },
  )();
}
