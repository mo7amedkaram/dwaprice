// Signed, httpOnly session cookies for the developer dashboard ("client") and the admin page
// ("admin"): base64url(JSON) + HMAC tag with API_SECRET, 30 days. No session table.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { apiSecret } from './handler';

export type SessionKind = 'client' | 'admin';

export interface Session {
  kind: SessionKind;
  /** api.clients.id for clients; the e-mail for admins. */
  id: string;
  email: string;
  /** Unix seconds. */
  exp: number;
}

const COOKIE: Record<SessionKind, string> = { client: 'dw_dev', admin: 'dw_admin' };
export const SESSION_DAYS = 30;

function tag(secret: string, data: string): string {
  return createHmac('sha256', secret).update(`session:${data}`).digest('base64url').slice(0, 32);
}

export function signSession(session: Session, secret: string): string {
  const data = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${data}.${tag(secret, data)}`;
}

export function verifySession(value: string | undefined, kind: SessionKind, secret: string, now = Date.now()): Session | null {
  if (!value || value.length > 1024) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = value.slice(0, dot);
  const given = value.slice(dot + 1);
  const expected = tag(secret, data);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Session;
    if (s.kind !== kind || typeof s.id !== 'string' || typeof s.exp !== 'number' || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession(kind: SessionKind): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE[kind])?.value, kind, apiSecret());
}

export async function setSession(kind: SessionKind, id: string, email: string): Promise<void> {
  const jar = await cookies();
  const session: Session = { kind, id, email, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400 };
  jar.set(COOKIE[kind], signSession(session, apiSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSession(kind: SessionKind): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE[kind]);
}
