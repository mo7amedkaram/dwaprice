'use server';
// Server actions of the developer dashboard: login links, keys (create / rotate / revoke), logout.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { issueKey, revokeKey, rotateKey } from './keys-admin';
import { getLang } from './lang';
import { consumeLoginToken, requestLoginLink } from './login';
import { clientIp, ipPrefix } from './net';
import { clearSession, getSession, setSession } from './session';

export interface LoginFormState {
  sent: boolean;
  limited?: boolean;
  devLink?: string;
}

export async function requestDevLoginAction(_prev: LoginFormState, form: FormData): Promise<LoginFormState> {
  const h = await headers();
  const r = await requestLoginLink(String(form.get('email') ?? ''), 'client', ipPrefix(clientIp(h)), h.get('host'), await getLang());
  return { sent: r.ok, limited: r.limited, devLink: r.devLink };
}

export interface KeyFormState {
  key?: string;
  prefix?: string;
  name?: string;
  error?: string;
}

export async function createKeyAction(_prev: KeyFormState, form: FormData): Promise<KeyFormState> {
  const s = await getSession('client');
  if (!s) redirect('/developer/login');
  try {
    const issued = await issueKey(s.id, String(form.get('name') ?? 'default').trim() || 'default');
    revalidatePath('/developer');
    return { key: issued.key, prefix: issued.row.key_prefix, name: issued.row.name };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function rotateKeyAction(_prev: KeyFormState, form: FormData): Promise<KeyFormState> {
  const s = await getSession('client');
  if (!s) redirect('/developer/login');
  const keyId = String(form.get('key_id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(keyId)) return { error: 'invalid key' };
  try {
    const issued = await rotateKey(s.id, keyId);
    if (!issued) return { error: 'key not found' };
    revalidatePath('/developer');
    return { key: issued.key, prefix: issued.row.key_prefix, name: issued.row.name };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function revokeKeyAction(form: FormData): Promise<void> {
  const s = await getSession('client');
  if (!s) redirect('/developer/login');
  const keyId = String(form.get('key_id') ?? '');
  if (/^[0-9a-f-]{36}$/.test(keyId)) await revokeKey(s.id, keyId);
  revalidatePath('/developer');
}

/** Second step of the magic link: a button on the verify page (GET links are pre-fetched by mail scanners). */
export async function completeDevLoginAction(form: FormData): Promise<void> {
  const result = await consumeLoginToken(String(form.get('token') ?? ''), 'client');
  if (!result?.clientId) redirect('/developer/login?error=token');
  await setSession('client', result.clientId, result.email);
  redirect('/developer');
}

export async function devLogoutAction(): Promise<void> {
  await clearSession('client');
  redirect('/developer/login');
}
