// Opaque, signed list cursors (docs/API_SPEC.md §5): base64url(JSON payload) + "." +
// 16 hex characters of HMAC-SHA256. The payload carries the sort/filter fingerprint
// (a cursor from different filters is rejected) and an expiry (24 h). Pure module.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CursorPayload {
  /** Fingerprint of sort + filters the cursor belongs to. */
  f: string;
  /** Expiry, Unix seconds. */
  e: number;
  /** Keyset: the sort key values of the last row ([name, id], [price|null, id], [ts, id]) — or an offset for ranked search. */
  k: Array<string | number | null>;
}

export const CURSOR_TTL_SECONDS = 24 * 3600;

/** Delta-feed cursor: the last event id delivered and the `since` of the first request. */
export function encodeFeedCursor(fingerprint: string, afterId: number, since: string, secret: string): string {
  return encodeCursor({ f: fingerprint, k: [afterId, since] }, secret);
}

export function decodeFeedCursor(cursor: string, fingerprint: string, secret: string): { afterId: number; since: string } | null {
  const c = decodeCursor(cursor, fingerprint, secret);
  if (!c || typeof c.k[0] !== 'number' || typeof c.k[1] !== 'string') return null;
  return { afterId: c.k[0], since: c.k[1] };
}

function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
}

export function encodeCursor(payload: Omit<CursorPayload, 'e'>, secret: string, now = Date.now()): string {
  const full: CursorPayload = { ...payload, e: Math.floor(now / 1000) + CURSOR_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

/** Returns the payload, or null when malformed, tampered, expired, or for other filters. */
export function decodeCursor(cursor: string, fingerprint: string, secret: string, now = Date.now()): CursorPayload | null {
  if (typeof cursor !== 'string' || cursor.length > 512) return null;
  const dot = cursor.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = cursor.slice(0, dot);
  const tag = cursor.slice(dot + 1);
  const expected = sign(secret, data);
  if (tag.length !== expected.length || !timingSafeEqual(Buffer.from(tag), Buffer.from(expected))) return null;
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.f !== fingerprint || !Array.isArray(payload.k) || typeof payload.e !== 'number') return null;
  if (payload.e * 1000 < now) return null;
  return payload;
}
