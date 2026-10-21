// Query-parameter parsing and validation for the API (pure module, unit-tested).
import { createHash } from 'node:crypto';
import { errors } from './errors';

export const LIMIT_MAX = 100;
export const SEARCH_RESULTS_MAX = 1000;
export const Q_MIN = 2;
export const Q_MAX = 80;

export const DOSAGE_FORMS = ['tablet', 'capsule', 'injection', 'syrup', 'suspension', 'drops', 'sachet', 'cream', 'ointment', 'gel', 'lotion', 'solution', 'spray', 'powder', 'inhaler', 'suppository', 'other'] as const;
export const ROUTES = ['oral', 'topical', 'injection', 'ophthalmic', 'vaginal', 'rectal', 'nasal', 'inhalation', 'otic', 'other'] as const;
export const RX = ['prescription', 'otc', 'not_applicable'] as const;
export const STATUSES = ['listed', 'not_available', 'not_yet_available', 'cancelled', 'illegal_import'] as const;
export const SORTS = ['name', 'price', '-price', 'updated_at', '-updated_at'] as const;
export const EVENT_TYPES = ['price_changed', 'added', 'status_changed', 'removed', 'renamed'] as const;

export type Sort = (typeof SORTS)[number];
export type EventType = (typeof EVENT_TYPES)[number];

export interface DrugFilters {
  q: string | null;
  company: string | null;
  ingredient: string | null;
  atc: string | null;
  dosage_form: (typeof DOSAGE_FORMS)[number] | null;
  route: (typeof ROUTES)[number] | null;
  prescription_status: (typeof RX)[number] | null;
  status: (typeof STATUSES)[number] | null;
  has_barcode: boolean | null;
  updated_since: string | null;
  sort: Sort;
}

type Issue = { param: string; issue: string };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ATC_RE = /^[A-Za-z](\d{2}([A-Za-z]([A-Za-z](\d{2})?)?)?)?$/;
export const BARCODE_RE = /^\d{8,14}$/;
export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(issues: Issue[]): never {
  throw errors.validation(issues.map((i) => `${i.param}: ${i.issue}`).join('; '), issues);
}

export function parseLimit(raw: string | null, dflt = 20, max = LIMIT_MAX): number {
  if (raw === null || raw === '') return dflt;
  if (!/^\d{1,3}$/.test(raw)) fail([{ param: 'limit', issue: 'must be an integer' }]);
  const n = Number(raw);
  if (n < 1 || n > max) fail([{ param: 'limit', issue: `must be between 1 and ${max}` }]);
  return n;
}

/** ISO 8601 timestamp (or date) → ISO string; validation error otherwise. */
export function parseTimestamp(param: string, raw: string | null): string | null {
  if (raw === null || raw === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) fail([{ param, issue: 'must be an ISO 8601 timestamp' }]);
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(d.getTime())) fail([{ param, issue: 'must be an ISO 8601 timestamp' }]);
  return d.toISOString();
}

function oneOf<T extends readonly string[]>(param: string, raw: string | null, values: T, issues: Issue[]): T[number] | null {
  if (raw === null || raw === '') return null;
  if (!values.includes(raw)) {
    issues.push({ param, issue: `must be one of ${values.join(', ')}` });
    return null;
  }
  return raw as T[number];
}

export function parseDrugFilters(sp: URLSearchParams): DrugFilters {
  const issues: Issue[] = [];
  const get = (k: string) => sp.get(k)?.trim() ?? null;
  const qRaw = get('q');
  let q: string | null = null;
  if (qRaw !== null && qRaw !== '') {
    q = qRaw.replace(/\s+/g, ' ');
    if (q.length < Q_MIN || q.length > Q_MAX) issues.push({ param: 'q', issue: `must be ${Q_MIN}–${Q_MAX} characters` });
  }
  const slugParam = (k: string) => {
    const v = get(k);
    if (v === null || v === '') return null;
    if (!SLUG_RE.test(v) || v.length > 120) {
      issues.push({ param: k, issue: 'must be an id (lower-case letters, digits, dashes)' });
      return null;
    }
    return v;
  };
  const atcRaw = get('atc');
  let atc: string | null = null;
  if (atcRaw) {
    if (!ATC_RE.test(atcRaw)) issues.push({ param: 'atc', issue: 'must be an ATC code or prefix (e.g. J01, N02BE01)' });
    else atc = atcRaw.toUpperCase();
  }
  const hb = get('has_barcode');
  let has_barcode: boolean | null = null;
  if (hb !== null && hb !== '') {
    if (hb === 'true' || hb === '1') has_barcode = true;
    else if (hb === 'false' || hb === '0') has_barcode = false;
    else issues.push({ param: 'has_barcode', issue: 'must be true or false' });
  }
  let updated_since: string | null = null;
  try {
    updated_since = parseTimestamp('updated_since', get('updated_since'));
  } catch (e) {
    issues.push(...(((e as { details?: Issue[] }).details as Issue[]) ?? []));
  }
  const filters: DrugFilters = {
    q,
    company: slugParam('company'),
    ingredient: slugParam('ingredient'),
    atc,
    dosage_form: oneOf('dosage_form', get('dosage_form'), DOSAGE_FORMS, issues),
    route: oneOf('route', get('route'), ROUTES, issues),
    prescription_status: oneOf('prescription_status', get('prescription_status'), RX, issues),
    status: oneOf('status', get('status'), STATUSES, issues),
    has_barcode,
    updated_since,
    sort: oneOf('sort', get('sort'), SORTS, issues) ?? 'name',
  };
  if (issues.length) fail(issues);
  return filters;
}

/** Stable fingerprint of sort + filters (cursors are bound to it). */
export function filterFingerprint(scope: string, filters: object): string {
  const entries = Object.entries(filters as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(`${scope}|${JSON.stringify(entries)}`).digest('hex').slice(0, 16);
}

/** Filters + limit of a list request, reporting every invalid parameter at once. */
export function parseListParams(sp: URLSearchParams, defaultLimit = 20): { filters: DrugFilters; limit: number } {
  const issues: Issue[] = [];
  let filters: DrugFilters | null = null;
  let limit = defaultLimit;
  try {
    filters = parseDrugFilters(sp);
  } catch (e) {
    issues.push(...((e as { details?: Issue[] }).details ?? []));
  }
  try {
    limit = parseLimit(sp.get('limit'), defaultLimit);
  } catch (e) {
    issues.push(...((e as { details?: Issue[] }).details ?? []));
  }
  if (issues.length || !filters) fail(issues);
  return { filters, limit };
}

export function parseId(raw: string): string {
  const id = decodeURIComponent(raw);
  if (!ID_RE.test(id) || id.length > 160) throw errors.validation('id: must be a drug id', [{ param: 'id', issue: 'invalid' }]);
  return id;
}

export function parseBarcode(raw: string): string {
  const b = decodeURIComponent(raw).trim();
  if (!BARCODE_RE.test(b)) throw errors.validation('barcode: must be 8–14 digits', [{ param: 'barcode', issue: 'invalid' }]);
  return b;
}

export function parseEventTypes(raw: string | null): EventType[] | null {
  if (raw === null || raw === '') return null;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((p) => !EVENT_TYPES.includes(p as EventType));
  if (bad.length || !parts.length) fail([{ param: 'type', issue: `must be a comma list of ${EVENT_TYPES.join(', ')}` }]);
  return [...new Set(parts)] as EventType[];
}

export function parseNamePrefix(raw: string | null): string | null {
  if (raw === null || raw === '') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < 1 || v.length > 80) fail([{ param: 'q', issue: 'must be 1–80 characters' }]);
  return v;
}
