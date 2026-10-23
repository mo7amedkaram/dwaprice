// Site-name signals check against a running server (default http://localhost:3100): prints the
// rendered <head> of the home page and its JSON-LD, asserts the title / og:site_name / WebSite +
// Organization fields, checks og:site_name on inner pages, that the icon URLs answer 200 and are
// not blocked by robots.txt, and posts the home HTML to validator.schema.org (Google's validator)
// so the structured data is confirmed error-free. Exit code 1 when anything fails.
// usage: BASE_URL=http://localhost:3100 node scripts/site-name-check.mjs [--no-validator]
const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const NAME = 'دليل الأدوية المصري';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const get = async (p) => {
  const r = await fetch(`${base}${p}`, { headers: { 'User-Agent': 'site-name-check' } });
  const type = r.headers.get('content-type') ?? '';
  return { status: r.status, type, text: type.startsWith('image/') ? null : await r.text() };
};

const home = await get('/');
const head = /<head>([\s\S]*?)<\/head>/.exec(home.text)?.[1] ?? '';
const tag = (re) => re.exec(head)?.[1] ?? null;
const jsonld = [...home.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

console.log('=== home <head> (metadata tags) ===');
console.log(
  head
    .replace(/></g, '>\n<')
    .split('\n')
    .filter((l) => /<title|<meta (name|property)="(description|og:|twitter:|robots|google)|<link rel="(canonical|icon|apple-touch-icon|manifest)/.test(l))
    .join('\n'),
);
console.log('\n=== home JSON-LD ===');
for (const j of jsonld) console.log(JSON.stringify(j, null, 2));

console.log('\n=== checks ===');
const title = tag(/<title>([^<]*)<\/title>/);
check('home <title> starts with the site name', title?.startsWith(`${NAME} | `) === true, title ?? '(none)');
check('home og:site_name', tag(/<meta property="og:site_name" content="([^"]*)"/) === NAME);
const website = jsonld.find((j) => j['@type'] === 'WebSite');
const org = jsonld.find((j) => j['@type'] === 'Organization');
check('WebSite JSON-LD present with name / url / alternateName / SearchAction', !!website && website.name === NAME && /^https?:\/\/[^/]+\/$/.test(website.url ?? '') && Array.isArray(website.alternateName) && website.alternateName.includes('dwaprice') && website.potentialAction?.['@type'] === 'SearchAction', website ? `url=${website.url} alternateName=${JSON.stringify(website.alternateName)}` : 'missing');
check('WebSite url ends with "/"', website?.url?.endsWith('/') === true);
check('alternateName never contains the bare domain', !(website?.alternateName ?? []).some((n) => /dwaprice\.com/i.test(n)));
check('Organization JSON-LD with the same name, url and a logo', !!org && org.name === NAME && org.url === website?.url && typeof org.logo === 'string' && /icon-512\.png$/.test(org.logo), org ? `logo=${org.logo}` : 'missing');
check('exactly one WebSite and one Organization on the home page', jsonld.filter((j) => j['@type'] === 'WebSite').length === 1 && jsonld.filter((j) => j['@type'] === 'Organization').length === 1);

// inner pages: og:site_name everywhere; the site WebSite/Organization objects (their @ids) only on
// the home page (a drug page's Drug JSON-LD legitimately nests a manufacturer Organization); the
// " | site name" suffix where the title is short enough (drug titles drop it past 60 characters by design).
for (const p of ['/dawa/brufen-600mg-30-tab', '/last-prices', '/sharika', '/api/en']) {
  const r = await get(p);
  const h = /<head>([\s\S]*?)<\/head>/.exec(r.text ?? '')?.[1] ?? '';
  const t = /<title>([^<]*)<\/title>/.exec(h)?.[1] ?? '';
  const sn = /<meta property="og:site_name" content="([^"]*)"/.exec(h)?.[1];
  const siteObjects = (r.text ?? '').includes('/#website') || (r.text ?? '').includes('/#organization');
  check(`${p}: og:site_name present, site WebSite/Organization objects absent`, sn === NAME && !siteObjects, `title="${t}"`);
  if (p === '/last-prices' || p === '/sharika') check(`${p}: title ends with " | ${NAME}"`, t.endsWith(` | ${NAME}`), t);
}

// icons + robots
const robots = (await get('/robots.txt')).text;
for (const p of ['/favicon.ico', '/icon-192.png', '/apple-touch-icon.png', '/icon-512.png']) {
  const r = await get(p);
  const blocked = robots.split('\n').some((l) => /^Disallow:\s*(\/favicon|\/icon|\/apple|\/$)/.test(l.trim()));
  check(`${p} → 200 image, not disallowed by robots.txt`, r.status === 200 && r.type.startsWith('image/') && !blocked, `${r.status} ${r.type}`);
}
check('home <head> links favicon.ico, icon-192.png and apple-touch-icon.png', /href="\/favicon\.ico"/.test(head) && /href="\/icon-192\.png"/.test(head) && /href="\/apple-touch-icon\.png"/.test(head));

// Google's structured-data validator (validator.schema.org). Its `html` parameter truncates a
// full page (hundreds of KB), so post a minimal document holding exactly the page's JSON-LD
// blocks — the structured data is validated verbatim, as the rendered home page serves it.
if (!process.argv.includes('--no-validator')) {
  try {
    const scripts = [...home.text.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
    const res = await fetch('https://validator.schema.org/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ html: `<!doctype html><html><head><title>x</title>${scripts}</head><body></body></html>` }),
    });
    const data = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));
    const errors = [];
    const seen = new Set();
    const walk = (n) => {
      for (const t of n.types ?? []) {
        seen.add(t.value);
        for (const e of t.errors ?? []) errors.push(JSON.stringify(e));
      }
      for (const e of n.errors ?? []) errors.push(JSON.stringify(e));
      for (const p of n.properties ?? []) for (const e of p.errors ?? []) errors.push(`${p.pred}: ${JSON.stringify(e)}`);
      // objects (publisher → Organization, potentialAction → SearchAction, …) are nodeProperties[].target
      for (const p of n.nodeProperties ?? []) {
        for (const e of p.errors ?? []) errors.push(`${p.pred}: ${JSON.stringify(e)}`);
        if (p.target) walk(p.target);
      }
    };
    for (const g of data.tripleGroups ?? []) for (const n of g.nodes ?? []) walk(n);
    const types = [...seen];
    check('validator.schema.org: no errors or warnings', errors.length === 0 && (data.totalNumErrors ?? 0) === 0 && (data.totalNumWarnings ?? 0) === 0, `objects=${data.numObjects ?? '?'} errors=${data.totalNumErrors ?? '?'} warnings=${data.totalNumWarnings ?? '?'} types=${types.join(',')}${errors.length ? ` detail=${errors.slice(0, 3).join(' | ')}` : ''}`);
    check('validator.schema.org: sees WebSite, SearchAction and Organization', types.includes('WebSite') && types.includes('SearchAction') && types.includes('Organization'), types.join(','));
  } catch (e) {
    check('validator.schema.org reachable', false, e.message);
  }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
