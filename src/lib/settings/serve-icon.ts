import 'server-only';
// Serves an icon from stable root URLs: the uploaded asset when one exists (cached, revalidated by
// the 'site-settings' tag), otherwise the built-in brand mark rendered to the same size. Not
// immutable, so a change propagates within a day. NOTE: production Nginx currently appends
// `Cache-Control: no-cache` to every response, so this max-age only takes effect once the Nginx
// icon location is added (DEPLOY.md); that does not affect correctness, only cache lifetime.
import { getSiteAsset } from './read';
import { builtinAsset } from './favicon';

const CACHE = 'public, max-age=86400';

export async function iconResponse(name: string, fallbackType: string): Promise<Response> {
  const stored = await getSiteAsset(name);
  if (stored) {
    return new Response(new Uint8Array(Buffer.from(stored.base64, 'base64')), {
      headers: { 'Content-Type': stored.contentType, 'Cache-Control': CACHE },
    });
  }
  const builtin = await builtinAsset(name);
  if (!builtin) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(builtin.bytes), { headers: { 'Content-Type': fallbackType, 'Cache-Control': CACHE } });
}
