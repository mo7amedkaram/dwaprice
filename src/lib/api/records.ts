// Shaping of api.drug_state rows into the public Drug object, and the list of fields that
// must never appear in any response (checked by tests and by a development-time assertion).
// Pure module.

export interface StateRow {
  id: string;
  record: Record<string, unknown>;
  price: string | number | null;
  first_seen_at: string | Date;
  last_changed_at: string | Date;
  last_price_changed_at: string | Date | null;
  is_current?: boolean;
  superseded_by?: string | null;
}

export const iso = (v: string | Date | null | undefined): string | null => (v == null ? null : new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z'));

/** Field order of the public Drug object (docs/API_SPEC.md §6.1); jsonb stores keys by length. */
const ORDER = ['id', 'trade_name_en', 'trade_name_ar', 'scientific_name', 'ingredients', 'strength', 'dosage_form', 'route', 'route_text', 'units_per_package', 'packaging', 'price', 'barcode', 'company', 'manufacturer', 'category', 'atc_codes', 'prescription_status', 'status', 'price_list_name', 'created_at', 'updated_at', 'links'];
const SUB_ORDER: Record<string, string[]> = {
  price: ['current', 'previous', 'unit_price', 'currency', 'effective_date', 'updated_at', 'verified', 'verified_at'],
  dosage_form: ['class', 'en', 'ar'],
  category: ['id', 'en', 'ar'],
  company: ['id', 'name'],
  manufacturer: ['id', 'name'],
  ingredients: ['id', 'name_en', 'name_ar', 'strength', 'atc_code'],
};

function ordered(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

/** The record stored by api.capture() plus the timestamps kept as columns, in the documented field order. */
export function finalizeRecord(row: StateRow): Record<string, unknown> {
  const price = { ...((row.record.price as Record<string, unknown>) ?? {}), updated_at: iso(row.last_price_changed_at) };
  const merged: Record<string, unknown> = { ...row.record, price, created_at: iso(row.first_seen_at), updated_at: iso(row.last_changed_at) };
  const out = ordered(merged, ORDER);
  for (const [key, keys] of Object.entries(SUB_ORDER)) {
    const v = out[key];
    if (Array.isArray(v)) out[key] = v.map((x) => (x && typeof x === 'object' ? ordered(x as Record<string, unknown>, keys) : x));
    else if (v && typeof v === 'object') out[key] = ordered(v as Record<string, unknown>, keys);
  }
  return out;
}

/**
 * Field names that belong to the app, the website or the research pipeline and must not
 * leak through the API: counters, images, research/indexing flags, clinical text, raw payload,
 * internal ids. Checked recursively on every response in tests/api-integration.test.ts.
 */
export const FORBIDDEN_FIELDS = new Set([
  'visit_count',
  'search_count',
  'image_url',
  'images',
  'indexable',
  'noindex_reason',
  'research_status',
  'payload',
  'research_payload',
  'product_key',
  'set_key',
  'exact_key',
  'uses',
  'dosage',
  'dosing',
  'side_effects',
  'contraindications',
  'interactions',
  'warnings',
  'pregnancy',
  'monitoring',
  'storage',
  'clinical_sections',
  'description_ar',
  'description_en',
  'sources',
  'aliases',
  'key_hash',
  'secret',
  'password',
  'email',
  'phone',
  'ip_prefix',
  'user_id',
  'patient_id',
]);

/** Paths (dot notation) of forbidden fields found anywhere in a JSON value. */
export function findForbiddenFields(value: unknown, path = ''): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...findForbiddenFields(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (FORBIDDEN_FIELDS.has(k)) found.push(p);
      found.push(...findForbiddenFields(v, p));
    }
  }
  return found;
}

/** Flattens a Drug object for CSV: nested objects become prefixed columns, arrays join with "|". */
export function flattenForCsv(record: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (v: unknown, prefix: string) => {
    if (v === null || v === undefined) out[prefix] = '';
    else if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') out[prefix] = v.map((x) => JSON.stringify(x)).join('|');
      else out[prefix] = v.map(String).join('|');
    } else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${prefix}_${k}`);
    } else out[prefix] = String(v);
  };
  for (const [k, v] of Object.entries(record)) walk(v, k);
  return out;
}

export const csvEscape = (s: string): string => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
