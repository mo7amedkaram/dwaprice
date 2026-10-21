// API keys: "dp_live_" + 40 base32 characters (25 random bytes, 200 bits). Only the
// SHA-256 hash is stored; the key is shown once. Pure module (unit-tested).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const KEY_PREFIX = 'dp_live_';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'; // RFC 4648 base32, lower case
export const KEY_RE = /^dp_live_[a-z2-7]{40}$/;

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Identification prefix stored next to the hash: "dp_live_" + 8 characters. */
export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 8);
}

export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + base32(randomBytes(25));
  return { key, prefix: keyPrefix(key), hash: hashKey(key) };
}

/** Parses "Authorization: Bearer <key>"; null when missing or malformed. */
export function bearerKey(authorization: string | null): string | null {
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  if (!m || !KEY_RE.test(m[1])) return null;
  return m[1];
}

export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
