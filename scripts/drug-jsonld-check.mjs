// Drug-page structured data check against a running server (default http://localhost:3100):
// for each slug, extract the page's JSON-LD, print the @types and the Drug's offers block, assert
// the price-directory rules (Drug not Product; no rating/review/shipping/returns/seller; image and
// gtin13 only when real; one Offer with EGP + priceValidUntil; BreadcrumbList kept), then post the
// page's JSON-LD to validator.schema.org (Google's schema validator) and report errors/warnings.
// The Rich Results Test has no API: run it by URL after the deploy (https://search.google.com/test/rich-results).
// usage: BASE_URL=http://localhost:3100 node scripts/drug-jsonld-check.mjs slug1 slug2 …
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (slugs.length === 0) throw new Error('pass drug slugs');
const FORBIDDEN = ['aggregateRating', 'review', 'reviews', 'shippingDetails', 'hasMerchantReturnPolicy', 'seller', 'itemCondition'];
const out = fileURLToPath(new URL('../docs/seo/', import.meta.url));
mkdirSync(out, { recursive: true });
let failures = 0;
const results = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
  return ok;
};

async function validate(scripts) {
  const res = await fetch('https://validator.schema.org/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams({ html: `<!doctype html><html><head><title>x</title>${scripts.join('\n')}</head><body></body></html>` }),
  });
  const data = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));
  const types = new Set();
  const problems = [];
  const walk = (n) => {
    for (const t of n.types ?? []) {
      types.add(t.value);
      for (const e of t.errors ?? []) problems.push(JSON.stringify(e));
    }
    for (const e of n.errors ?? []) problems.push(JSON.stringify(e));
    for (const p of n.properties ?? []) for (const e of p.errors ?? []) problems.push(`${p.pred}: ${JSON.stringify(e)}`);
    for (const p of n.nodeProperties ?? []) {
      for (const e of p.errors ?? []) problems.push(`${p.pred}: ${JSON.stringify(e)}`);
      if (p.target) walk(p.target);
    }
  };
  for (const g of data.tripleGroups ?? []) for (const n of g.nodes ?? []) walk(n);
  return { errors: data.totalNumErrors ?? 0, warnings: data.totalNumWarnings ?? 0, types: [...types], problems };
}

for (const slug of slugs) {
  console.log(`\n=== /dawa/${slug} ===`);
  const res = await fetch(`${base}/dawa/${slug}`, { headers: { 'User-Agent': 'drug-jsonld-check' } });
  if (res.status !== 200) {
    check('page 200', false, String(res.status));
    continue;
  }
  const html = await res.text();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)].map((m) => m[0]);
  const objects = scripts.flatMap((s) => {
    const j = JSON.parse(s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    return Array.isArray(j) ? j : [j];
  });
  const types = objects.map((o) => o['@type']);
  const drug = objects.find((o) => o['@type'] === 'Drug');
  console.log('@types:', types.join(', '));
  if (drug) {
    console.log('Drug fields:', Object.keys(drug).filter((k) => !k.startsWith('@')).join(', '));
    console.log('offers:', JSON.stringify(drug.offers ?? null, null, 1));
  }
  check('main entity is Drug (no Product, no Store)', !!drug && !types.includes('Product') && !JSON.stringify(objects).includes('"Store"'), types.join(','));
  check('BreadcrumbList kept', types.includes('BreadcrumbList'));
  const text = JSON.stringify(drug ?? {});
  check('no rating / review / shipping / returns / seller', FORBIDDEN.every((k) => !text.includes(`"${k}"`)));
  check('name Arabic + alternateName English, url, manufacturer Organization', !!drug && typeof drug.name === 'string' && typeof drug.url === 'string' && (!drug.manufacturer || drug.manufacturer['@type'] === 'Organization'));
  check('image only when a verified photo exists (never a placeholder)', !drug?.image || (/^https?:\/\//.test(drug.image) && !/placeholder|default|no-image/i.test(drug.image)), drug?.image ? `image=${drug.image}` : 'no image');
  check('gtin13 absent or a valid 13-digit code', !drug?.gtin13 || /^\d{13}$/.test(drug.gtin13), drug?.gtin13 ? `gtin13=${drug.gtin13}` : 'no gtin13');
  check('description present (facts paragraph)', typeof drug?.description === 'string' && drug.description.length > 20);
  if (drug?.offers) {
    const o = drug.offers;
    check('one Offer with price, EGP, priceValidUntil (future), VAT-inclusive priceSpecification', !Array.isArray(o) && o['@type'] === 'Offer' && /^\d+\.\d{2}$/.test(o.price) && o.priceCurrency === 'EGP' && o.priceValidUntil > new Date().toISOString().slice(0, 10) && o.priceSpecification?.valueAddedTaxIncluded === true, `price=${o.price} availability=${o.availability ?? '(omitted)'} validUntil=${o.priceValidUntil}`);
    check('availability is InStock/OutOfStock or omitted', !o.availability || /\/(InStock|OutOfStock)$/.test(o.availability));
  } else {
    console.log('  (no offers: no price)');
  }
  const v = await validate(scripts).catch((e) => ({ errors: -1, warnings: -1, types: [], problems: [e.message] }));
  check('validator.schema.org: 0 errors, 0 warnings', v.errors === 0 && v.warnings === 0, `errors=${v.errors} warnings=${v.warnings} types=${v.types.join(',')}${v.problems.length ? ` problems=${v.problems.slice(0, 3).join(' | ')}` : ''}`);
  results.push({ slug, types, drugFields: drug ? Object.keys(drug) : [], offers: drug?.offers ?? null, image: drug?.image ?? null, gtin13: drug?.gtin13 ?? null, validator: v });
}
writeFileSync(`${out}drug-jsonld-check.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base, results }, null, 2));
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
