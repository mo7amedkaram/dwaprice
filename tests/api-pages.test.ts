import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDocs, loadSpec, resolveRef, typeOf } from '@/lib/api-docs/openapi';
import { signSession, verifySession } from '@/lib/api/session';
import { EXPLORER_ENDPOINTS, explorerUrl, snippet } from '@/lib/api/snippets';

const SECRET = 'unit-test-secret-0123456789';

describe('sessions', () => {
  it('signs and verifies, binds the kind, rejects tampering and expiry', () => {
    const now = Date.now();
    const value = signSession({ kind: 'client', id: 'c1', email: 'a@b.c', exp: Math.floor(now / 1000) + 60 }, SECRET);
    expect(verifySession(value, 'client', SECRET, now)?.id).toBe('c1');
    expect(verifySession(value, 'admin', SECRET, now)).toBeNull();
    expect(verifySession(value, 'client', 'other', now)).toBeNull();
    expect(verifySession(value.slice(0, -2) + 'zz', 'client', SECRET, now)).toBeNull();
    expect(verifySession(value, 'client', SECRET, now + 120_000)).toBeNull();
    expect(verifySession(undefined, 'client', SECRET)).toBeNull();
  });
});

describe('snippets and explorer URLs', () => {
  it('builds sample URLs from parameters (path encoded, empty query params dropped)', () => {
    const drug = EXPLORER_ENDPOINTS.find((e) => e.id === 'drug')!;
    expect(explorerUrl('https://api.x/v1', drug, { id: 'augmentin-1gm-14-tablets' })).toBe('https://api.x/v1/sample/drugs/augmentin-1gm-14-tablets');
    const list = EXPLORER_ENDPOINTS.find((e) => e.id === 'drugs')!;
    expect(explorerUrl('/api/v1', list, { q: 'اوجمنتن', limit: '5', sort: '' })).toBe('/api/v1/sample/drugs?q=%D8%A7%D9%88%D8%AC%D9%85%D9%86%D8%AA%D9%86&limit=5');
  });
  it('produces five languages with and without a key', () => {
    const url = 'https://api.x/v1/drugs/by-barcode/6221051011317';
    for (const lang of ['curl', 'javascript', 'python', 'php', 'dart'] as const) {
      expect(snippet(lang, url, 'dp_live_k')).toContain('dp_live_k');
      expect(snippet(lang, url, null)).not.toContain('Authorization');
      expect(snippet(lang, url, null)).toContain(url);
    }
  });
});

describe('OpenAPI loader', () => {
  const spec = loadSpec(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
  const docs = buildDocs(spec);
  it('resolves $ref and summarises types', () => {
    expect(resolveRef(spec, '#/components/schemas/Drug').type).toBe('object');
    expect(typeOf(spec, { $ref: '#/components/schemas/Drug' })).toBe('Drug');
    expect(typeOf(spec, { type: ['string', 'null'] })).toBe('string | null');
    expect(typeOf(spec, { type: 'array', items: { $ref: '#/components/schemas/Ingredient' } })).toBe('Ingredient[]');
    expect(typeOf(spec, { type: 'string', enum: ['a', 'b'] })).toBe('a | b');
  });
  it('groups every operation by tag with parameters and responses', () => {
    const all = docs.tags.flatMap((t) => t.operations);
    expect(all.length).toBe(24); // 23 paths, /webhooks has GET and POST
    const list = all.find((o) => o.id === 'listDrugs')!;
    expect(list.method).toBe('GET');
    expect(list.auth).toBe(true);
    expect(list.params.map((p) => p.name)).toContain('updated_since');
    expect(list.responses.map((r) => r.status)).toContain('429');
    expect(all.find((o) => o.id === 'sampleListDrugs')!.auth).toBe(false);
  });
  it('turns the Drug schema into a field table with nested price fields and an example', () => {
    const drug = docs.schemas.find((s) => s.name === 'Drug')!;
    const names = drug.fields.map((f) => f.name);
    expect(names).toContain('price.current');
    expect(names).toContain('links.web_url');
    expect(drug.fields.find((f) => f.name === 'id')?.required).toBe(true);
    expect(drug.example).toContain('congestal-20-tabs');
    expect(docs.schemas.find((s) => s.name === 'ListingStatus')?.values).toContain('listed');
  });
});
