import { describe, expect, it } from 'vitest';
import { decodeCursor, decodeFeedCursor, encodeCursor, encodeFeedCursor } from '@/lib/api/cursor';
import { ApiError } from '@/lib/api/errors';
import { bearerKey, generateKey, hashKey, KEY_RE } from '@/lib/api/keys';
import { clientIp, ipAllowed, ipInCidr, ipPrefix } from '@/lib/api/net';
import { filterFingerprint, parseBarcode, parseDrugFilters, parseEventTypes, parseId, parseLimit, parseTimestamp } from '@/lib/api/params';
import { csvEscape, finalizeRecord, findForbiddenFields, flattenForCsv } from '@/lib/api/records';
import { windowReset } from '@/lib/api/ratelimit';
import { makeCanary } from '@/lib/api/canaries';

const SECRET = 'test-secret-0123456789abcdef';

describe('API keys', () => {
  it('generates dp_live_ keys with 40 base32 characters and stores only a hash', () => {
    const k = generateKey();
    expect(k.key).toMatch(KEY_RE);
    expect(k.prefix).toBe(k.key.slice(0, 16));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(k.key)).toBe(k.hash);
    expect(generateKey().key).not.toBe(k.key);
  });

  it('parses the Authorization header strictly', () => {
    const k = generateKey().key;
    expect(bearerKey(`Bearer ${k}`)).toBe(k);
    expect(bearerKey(`bearer   ${k} `)).toBe(k);
    expect(bearerKey(k)).toBeNull();
    expect(bearerKey('Bearer dp_live_short')).toBeNull();
    expect(bearerKey('Basic abc')).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});

describe('cursors', () => {
  it('round-trips, binds to the filter fingerprint and expires', () => {
    const c = encodeCursor({ f: 'abc', k: ['name', 'id-1'] }, SECRET);
    expect(decodeCursor(c, 'abc', SECRET)?.k).toEqual(['name', 'id-1']);
    expect(decodeCursor(c, 'other-filters', SECRET)).toBeNull();
    expect(decodeCursor(c, 'abc', 'wrong-secret')).toBeNull();
    expect(decodeCursor(c.slice(0, -1) + 'x', 'abc', SECRET)).toBeNull();
    expect(decodeCursor(c, 'abc', SECRET, Date.now() + 25 * 3600_000)).toBeNull();
    expect(decodeCursor('garbage', 'abc', SECRET)).toBeNull();
  });

  it('feed cursors carry the original since, so the next page needs only the cursor', () => {
    const c = encodeFeedCursor('changes', 48213, '2026-10-21T12:00:00.000Z', SECRET);
    expect(decodeFeedCursor(c, 'changes', SECRET)).toEqual({ afterId: 48213, since: '2026-10-21T12:00:00.000Z' });
    expect(decodeFeedCursor(c, 'sample-changes', SECRET)).toBeNull();
    expect(decodeFeedCursor(encodeCursor({ f: 'changes', k: ['x', 1] }, SECRET), 'changes', SECRET)).toBeNull();
  });

  it('fingerprints ignore null filters and parameter order', () => {
    expect(filterFingerprint('drugs', { a: 1, b: null })).toBe(filterFingerprint('drugs', { b: null, a: 1 }));
    expect(filterFingerprint('drugs', { a: 1 })).not.toBe(filterFingerprint('drugs', { a: 2 }));
    expect(filterFingerprint('drugs', { a: 1 })).not.toBe(filterFingerprint('sample-drugs', { a: 1 }));
  });
});

describe('parameters', () => {
  const sp = (s: string) => new URLSearchParams(s);
  it('validates limit', () => {
    expect(parseLimit(null)).toBe(20);
    expect(parseLimit('100')).toBe(100);
    expect(() => parseLimit('0')).toThrow(ApiError);
    expect(() => parseLimit('101')).toThrow(/between 1 and 100/);
    expect(() => parseLimit('abc')).toThrow(ApiError);
  });
  it('parses drug filters and rejects bad values with details per parameter', () => {
    const f = parseDrugFilters(sp('q=panadol&company=sigma&atc=j01&dosage_form=tablet&has_barcode=true&updated_since=2026-10-01&sort=-price'));
    expect(f).toMatchObject({ q: 'panadol', company: 'sigma', atc: 'J01', dosage_form: 'tablet', has_barcode: true, updated_since: '2026-10-01T00:00:00.000Z', sort: '-price' });
    try {
      parseDrugFilters(sp('q=a&dosage_form=pill&sort=random&atc=123&limit=5'));
      throw new Error('should fail');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(400);
      expect(err.code).toBe('validation_error');
      expect((err.details as Array<{ param: string }>).map((d) => d.param).sort()).toEqual(['atc', 'dosage_form', 'q', 'sort']);
    }
  });
  it('validates ids, barcodes, timestamps and event types', () => {
    expect(parseId('congestal-20-tabs')).toBe('congestal-20-tabs');
    expect(() => parseId('Congestal 20')).toThrow(ApiError);
    expect(parseBarcode('6221051011317')).toBe('6221051011317');
    expect(() => parseBarcode('12ab')).toThrow(ApiError);
    expect(parseTimestamp('since', '2026-10-21T12:00:00Z')).toBe('2026-10-21T12:00:00.000Z');
    expect(() => parseTimestamp('since', 'yesterday')).toThrow(ApiError);
    expect(parseEventTypes('price_changed, added')).toEqual(['price_changed', 'added']);
    expect(() => parseEventTypes('deleted')).toThrow(ApiError);
  });
});

describe('records', () => {
  const row = {
    id: 'x-1',
    record: { id: 'x-1', price: { current: 50, currency: 'EGP' }, company: { id: 'sigma', name: 'Sigma' } },
    price: '50',
    first_seen_at: '2026-11-01T00:00:00Z',
    last_changed_at: '2026-11-02T10:00:00Z',
    last_price_changed_at: null,
  };
  it('injects the timestamps kept as columns and restores the documented field order', () => {
    const r = finalizeRecord(row) as { price: { updated_at: string | null }; created_at: string; updated_at: string };
    expect(r.created_at).toBe('2026-11-01T00:00:00Z');
    expect(r.updated_at).toBe('2026-11-02T10:00:00Z');
    expect(r.price.updated_at).toBeNull();
    expect(Object.keys(r)).toEqual(['id', 'price', 'company', 'created_at', 'updated_at']);
    expect(Object.keys(r.price)).toEqual(['current', 'currency', 'updated_at']);
  });
  it('finds forbidden fields anywhere in a response', () => {
    expect(findForbiddenFields({ data: [{ id: 1, visit_count: 3 }], meta: { nested: { image_url: 'x' } } })).toEqual(['data[0].visit_count', 'meta.nested.image_url']);
    expect(findForbiddenFields(finalizeRecord(row))).toEqual([]);
    expect(findForbiddenFields(makeCanary(3))).toEqual([]);
  });
  it('flattens nested objects for CSV and escapes cells', () => {
    const flat = flattenForCsv({ id: 'a', price: { current: 1.5, currency: 'EGP' }, atc_codes: ['N02', 'R06'], ingredients: [{ id: 'x' }] });
    expect(flat).toEqual({ id: 'a', price_current: '1.5', price_currency: 'EGP', atc_codes: 'N02|R06', ingredients: '{"id":"x"}' });
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('plain')).toBe('plain');
  });
  it('canaries look like products but carry no price, barcode or ingredient', () => {
    const c = makeCanary(1) as { status: string; price: { current: null }; barcode: null; id: string };
    expect(c.status).toBe('not_available');
    expect(c.price.current).toBeNull();
    expect(c.barcode).toBeNull();
    expect(c.id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('network helpers', () => {
  it('reads the client IP behind proxies and truncates it for logs', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.42, 10.0.0.1' }))).toBe('203.0.113.42');
    expect(clientIp(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(new Headers())).toBe('0.0.0.0');
    expect(ipPrefix('203.0.113.42')).toBe('203.0.113.0/24');
    expect(ipPrefix('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd::/48');
  });
  it('matches CIDR allowlists for IPv4 and IPv6', () => {
    expect(ipInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('11.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(ipInCidr('203.0.113.42', '203.0.113.42')).toBe(true);
    expect(ipInCidr('2001:db8::5', '2001:db8::/32')).toBe(true);
    expect(ipInCidr('2001:db9::5', '2001:db8::/32')).toBe(false);
    expect(ipAllowed('1.2.3.4', [])).toBe(true);
    expect(ipAllowed('1.2.3.4', ['5.0.0.0/8'])).toBe(false);
  });
});

describe('rate windows', () => {
  it('resets at the next minute, day and month (UTC)', () => {
    const now = new Date('2026-10-21T12:34:56Z');
    expect(new Date(windowReset('minute', now) * 1000).toISOString()).toBe('2026-10-21T12:35:00.000Z');
    expect(new Date(windowReset('day', now) * 1000).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(new Date(windowReset('month', now) * 1000).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
