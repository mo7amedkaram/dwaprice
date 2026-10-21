// Canary records (docs/API_SPEC.md §12): three synthetic products per Enterprise client,
// included only in that client's bulk exports, so a leaked export can be traced. They are
// plausible but harmless: no price, no barcode, status not_available.
import { randomBytes, randomInt } from 'node:crypto';
import { apiQuery } from './db';

const BRANDS: Array<[string, string]> = [
  ['Velorix', 'فيلوريكس'], ['Zantrelle', 'زانتريل'], ['Nocturem', 'نوكتوريم'], ['Alvetra', 'الفيترا'], ['Corvanex', 'كورفانكس'],
  ['Trimaleen', 'تريمالين'], ['Pexolan', 'بيكسولان'], ['Varnique', 'فارنيك'], ['Meldoril', 'ميلدوريل'], ['Sarvotin', 'سارفوتين'],
  ['Quilaren', 'كيلارين'], ['Benzorelle', 'بنزوريل'], ['Lumivast', 'لوميفاست'], ['Orvipan', 'أورفيبان'], ['Tessamine', 'تيسامين'],
];
const FORMS: Array<{ cls: string; en: string; ar: string; units: number[]; strengths: string[]; suffix: string }> = [
  { cls: 'tablet', en: 'Film-coated tablets', ar: 'أقراص مغلفة', units: [10, 20, 30], strengths: ['5 mg', '10 mg', '25 mg', '50 mg', '100 mg'], suffix: 'tabs' },
  { cls: 'capsule', en: 'Capsules', ar: 'كبسولات', units: [10, 20, 30], strengths: ['100 mg', '200 mg', '250 mg'], suffix: 'caps' },
  { cls: 'syrup', en: 'Syrup', ar: 'شراب', units: [1], strengths: ['2 mg/5 ml', '5 mg/5 ml'], suffix: 'syrup-120ml' },
];
const COMPANIES: Array<[string, string]> = [['nile-valley-pharma', 'Nile Valley Pharma'], ['delta-labs', 'Delta Labs'], ['horizon-pharmaceuticals', 'Horizon Pharmaceuticals']];

export function makeCanary(seed: number): Record<string, unknown> {
  const [en, ar] = BRANDS[seed % BRANDS.length];
  const form = FORMS[seed % FORMS.length];
  const strength = form.strengths[randomInt(form.strengths.length)];
  const units = form.units[randomInt(form.units.length)];
  const [cid, cname] = COMPANIES[randomInt(COMPANIES.length)];
  const id = `${en.toLowerCase()}-${strength.replace(/[^0-9a-z]+/gi, '').toLowerCase()}-${units > 1 ? `${units}-` : ''}${form.suffix}-${randomBytes(2).toString('hex')}`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    id,
    trade_name_en: `${en} ${strength} ${units > 1 ? `${units} ${form.suffix}` : form.suffix.replace('-', ' ')}`,
    trade_name_ar: `${ar} ${strength.replace('mg', 'مجم').replace('ml', 'مل')}`,
    scientific_name: null,
    ingredients: [],
    strength,
    dosage_form: { class: form.cls, en: form.en, ar: form.ar },
    route: 'oral',
    route_text: 'Oral',
    units_per_package: units > 1 ? units : null,
    packaging: null,
    price: { current: null, previous: null, unit_price: null, currency: 'EGP', effective_date: null, updated_at: null, verified: false, verified_at: null },
    barcode: null,
    company: { id: cid, name: cname },
    manufacturer: null,
    category: { id: 'food-supplement', en: 'Food supplement', ar: 'مكمل غذائي' },
    atc_codes: [],
    prescription_status: 'not_applicable',
    status: 'not_available',
    price_list_name: `${en} ${strength}`,
    created_at: now,
    updated_at: now,
    links: { web_url: `https://dwaprice.com/dawa/${id}` },
  };
}

/** The client's three canaries, created on first use. */
export async function clientCanaries(clientId: string): Promise<Record<string, unknown>[]> {
  const existing = await apiQuery<{ record: Record<string, unknown> }>('select record from api.canaries where client_id = $1 order by created_at', [clientId]);
  if (existing.length >= 3) return existing.map((r) => r.record);
  const start = randomInt(BRANDS.length);
  const made: Record<string, unknown>[] = [];
  for (let i = existing.length; i < 3; i++) {
    const record = makeCanary(start + i * 7);
    await apiQuery('insert into api.canaries (id, client_id, record) values ($1, $2, $3) on conflict do nothing', [record.id, clientId, JSON.stringify(record)]);
    made.push(record);
  }
  return [...existing.map((r) => r.record), ...made];
}
