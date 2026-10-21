// Client address helpers (pure module): the request IP behind a proxy/CDN, the /24 (or /48)
// prefix stored in logs, and CIDR matching for the Enterprise allowlist.
import { isIP } from 'node:net';

export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first && isIP(first)) return first;
  const real = headers.get('x-real-ip')?.trim();
  if (real && isIP(real)) return real;
  return '0.0.0.0';
}

function ipToBytes(ip: string): Uint8Array | null {
  const kind = isIP(ip);
  if (kind === 4) return Uint8Array.from(ip.split('.').map(Number));
  if (kind !== 6) return null;
  // IPv6, possibly with "::" compression and an embedded IPv4 tail
  let addr = ip;
  const v4 = /:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    const b = v4[1].split('.').map(Number);
    addr = addr.replace(v4[1], `${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`);
  }
  const [head, tail = ''] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => {
    const n = parseInt(g || '0', 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 255;
  });
  return out;
}

/** "203.0.113.42" -> "203.0.113.0/24"; IPv6 -> /48. Unknown -> "unknown". */
export function ipPrefix(ip: string): string {
  const kind = isIP(ip);
  if (kind === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
  if (kind === 6) {
    const b = ipToBytes(ip);
    if (!b) return 'unknown';
    const g = (i: number) => ((b[i] << 8) | b[i + 1]).toString(16);
    return `${g(0)}:${g(2)}:${g(4)}::/48`;
  }
  return 'unknown';
}

/** True when `ip` is inside `cidr` ("10.0.0.0/8", "2001:db8::/32", or a bare address). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.split('/');
  const a = ipToBytes(ip);
  const n = ipToBytes(net);
  if (!a || !n || a.length !== n.length) return false;
  const bits = bitsRaw === undefined ? n.length * 8 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > n.length * 8) return false;
  for (let i = 0; i < n.length; i++) {
    const remaining = bits - i * 8;
    if (remaining <= 0) return true;
    const mask = remaining >= 8 ? 255 : (0xff << (8 - remaining)) & 0xff;
    if ((a[i] & mask) !== (n[i] & mask)) return false;
  }
  return true;
}

export const ipAllowed = (ip: string, allowlist: string[]): boolean => allowlist.length === 0 || allowlist.some((c) => ipInCidr(ip, c));
