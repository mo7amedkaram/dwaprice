import { getCurrentIndex } from '@/lib/search/current-index';

// Tiny version marker for the live suggestion index. The client fetches this on load (cheap, cached
// 60 s at the edge), compares `hash` with the index it already has, and only downloads
// current.json?v=<hash> when the hash changed — so a new or edited drug reaches the suggestions
// within about a minute, with no deploy and no re-download when nothing changed. `hash` is the
// content hash of the very build current.json serves, so the two never disagree.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { hash, drugs, generatedAt } = await getCurrentIndex();
    return new Response(JSON.stringify({ hash, drugs, generatedAt }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch {
    // Database trouble: no version. The client keeps using the build-time static index.
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
