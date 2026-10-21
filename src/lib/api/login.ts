// E-mail magic links (docs/API_SPEC.md §15.6): a one-time token (15 minutes, hash stored in
// api.login_tokens) sent to a client's e-mail (api.clients). Admins log in with e-mail + password (admin-auth.ts).
// The answer is the same whether or not the address is known.
import { createHash, randomBytes } from 'node:crypto';
import { apiQuery } from './db';
import type { Lang } from './lang';
import { sendEmail } from './notify';
import { hit } from './ratelimit';
import type { SessionKind } from './session';
import { SITE } from '@/lib/site';

const TOKEN_MINUTES = 15;

/** The page that exchanges the token for a session cookie (client magic links; admins use a password). */
export function loginPath(kind: SessionKind): string {
  return kind === 'admin' ? '/admin/api/login' : '/developer/login/verify';
}

export interface LoginRequestResult {
  ok: boolean;
  /** Only when API_DEV_LOGIN_LINKS=true (local testing): the link that would have been mailed. */
  devLink?: string;
  /** Too many attempts. */
  limited?: boolean;
}

/** Creates and mails a login link when the address is known; always answers the same to the user. */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export async function requestLoginLink(emailRaw: string, kind: SessionKind, ipPrefix: string, host: string | null, lang: Lang = 'ar'): Promise<LoginRequestResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: true };
  const [ip, addr] = await hit([
    { scope: `login:${ipPrefix}:m`, window: 'minute' },
    { scope: `login:${email}:d`, window: 'day' },
  ]);
  if (ip.count > 5 || addr.count > 10) return { ok: false, limited: true };

  let clientId: string | null = null;
  if (kind === 'client') {
    const rows = await apiQuery<{ id: string }>("select id from api.clients where lower(email) = $1 and status <> 'closed' order by created_at limit 1", [email]);
    if (!rows[0]) return { ok: true };
    clientId = rows[0].id;
  } else {
    return { ok: true }; // admins log in with a password
  }

  const token = randomBytes(32).toString('base64url');
  await apiQuery(
    `insert into api.login_tokens (email, kind, token_hash, client_id, expires_at, ip_prefix) values ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval, $6)`,
    [email, kind, createHash('sha256').update(token).digest('hex'), clientId, String(TOKEN_MINUTES), ipPrefix],
  );
  const link = `${SITE.url}${loginPath(kind)}?token=${token}`;
  const subject = lang === 'en' ? 'Your developer dashboard login link' : 'رابط الدخول إلى لوحة المطورين';
  const text =
    lang === 'en'
      ? `Developer dashboard — ${SITE.name}

Login link (valid ${TOKEN_MINUTES} minutes, single use):
${link}

If you did not request this link, ignore this e-mail.`
      : `لوحة المطورين — ${SITE.name}

رابط الدخول (صالح ${TOKEN_MINUTES} دقيقة، يُستخدم مرة واحدة):
${link}

إن لم تطلب هذا الرابط فتجاهل الرسالة.`;
  const sent = await sendEmail({ to: email, subject, text });
  const result: LoginRequestResult = { ok: true };
  // Local development only: the link on the page would otherwise let anyone log in as any client.
  if (!sent && process.env.API_DEV_LOGIN_LINKS === 'true' && LOCAL_HOST.test(host ?? '')) result.devLink = link;
  return result;
}

/** Validates a token from a link, marks it used; null when invalid, expired or used. */
export async function consumeLoginToken(token: string, kind: SessionKind): Promise<{ email: string; clientId: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const rows = await apiQuery<{ email: string; client_id: string | null }>(
    `update api.login_tokens set used_at = now()
     where token_hash = $1 and kind = $2 and used_at is null and expires_at > now()
     returning email, client_id`,
    [createHash('sha256').update(token).digest('hex'), kind],
  );
  if (!rows[0]) return null;
  if (kind === 'client' && rows[0].client_id) await apiQuery('update api.clients set last_login_at = now() where id = $1', [rows[0].client_id]);
  return { email: rows[0].email, clientId: rows[0].client_id };
}
