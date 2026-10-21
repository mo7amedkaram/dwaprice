import Link from 'next/link';
import { Breadcrumbs } from '../../Breadcrumbs';
import { ApiNav } from '../ApiNav';
import { FieldTable } from '../Blocks';
import { Code, CodeBlock } from '../CodeBlock';
import { Markdown } from '../Markdown';
import { Badge, Container, buttonClass, cx } from '../../ui';
import { getApiDocs } from '@/lib/api-docs/openapi';
import { switchHref, type Lang } from '@/lib/api/lang';
import { apiPublicBase } from '@/lib/api/public-base';
import { snippet } from '@/lib/api/snippets';

const METHOD_TONE: Record<string, 'primary' | 'down' | 'up' | 'neutral'> = { GET: 'primary', POST: 'down', DELETE: 'up' };
const CHANGELOG = [{ version: '1.0.0', date: '2026-10-21', en: 'Initial release: drugs, search, barcode lookup, alternatives, price history, delta feed, companies, ingredients, meta; keyless sample; Enterprise exports and webhooks.', ar: 'الإصدار الأول: الأدوية، البحث، الباركود، البدائل، تاريخ السعر، تغذية التغييرات، الشركات، المواد الفعالة، meta؛ عينة بلا مفتاح؛ التصدير والـ webhooks لخطة Enterprise.' }];

const GUIDES = {
  en: {
    toc: { 'getting-started': 'Getting started', authentication: 'Authentication', pagination: 'Pagination', errors: 'Errors', 'rate-limits': 'Rate limits', 'delta-sync': 'Delta-sync guide', schemas: 'Schemas', changelog: 'Changelog' },
    crumb: 'Drug Prices API', here: 'Documentation', base: 'Base URL', conventions: 'JSON, UTF-8, snake_case · breaking changes only in', trySample: 'Try the sample', contents: 'Contents', referenceNote: null as string | null,
    start: (base: string) => [
      <>Try the keyless sample: <Code>GET {base}/sample/drugs?q=augmentin</Code> (50 fixed products, same shapes, <Code>{'"sample": true'}</Code>).</>,
      <><Link prefetch={false} href="/api/en/request-access" className="text-primary underline">Request access</Link>; once approved, create a key in the <a href={switchHref('/developer', 'en')} className="text-primary underline">developer dashboard</a>. The key is shown once.</>,
      <>Call the real endpoints with <Code>Authorization: Bearer dp_live_…</Code>. Keep the key server-side; never ship it in a browser or mobile app.</>,
    ],
    firstRequest: 'First request',
    auth: 'Every non-sample request needs `Authorization: Bearer dp_live_…`. Missing, malformed, unknown, revoked or expired keys answer **401 unauthorized** (the same answer: we do not reveal which). A valid key whose plan, scope or IP allowlist does not allow the endpoint answers **403 forbidden** with `details.required_scope` or `details.plan`.\n\nKeys: `dp_live_` + 40 base32 characters, generated from 25 random bytes; only a SHA-256 hash is stored. Scopes: `drugs:read`, `changes:read`, `export`, `webhooks`. Rotation gives the old key a 24-hour grace period; revocation is immediate.',
    pagination: 'Lists take `limit` (1–100, default 20) and `cursor`, and return `page: { limit, has_more, next_cursor }`. The cursor is an opaque signed string, valid 24 hours and bound to the sort and filters (changing a filter answers **400 invalid_cursor**). Listings use keyset cursors that stay stable while the dataset changes; search results (`q`) are ranked and capped at 1,000. Lists carry no total count; `/meta` has the dataset counts.',
    page2: 'Page 2',
    errorsIntro: <>One shape for every non-2xx answer: <Code>{'{ "error": { "code", "message", "details" } }'}</Code>. <Code>message</Code> is for developers; <Code>details</Code> is structured (an object, an array of <Code>{'{ param, issue }'}</Code> for validation, or <Code>null</Code>).</>,
    errorRows: [
      ['400 validation_error', 'details[]', 'Every invalid parameter, with param and issue.'], ['400 invalid_cursor', '—', 'Cursor expired, malformed, or from other filters.'], ['400 since_too_old', 'window_days', 'since is outside the plan’s feed window: reload with /drugs.'],
      ['401 unauthorized', '—', 'Missing, malformed, unknown, revoked or expired key.'], ['403 forbidden', 'plan, required_scope, reason', 'Plan, scope, suspended account or expired subscription.'], ['403 ip_not_allowed', '—', 'Enterprise IP allowlist.'],
      ['404 not_found', '—', 'Unknown id or path.'], ['301 moved', 'new_id + Location', 'The id was retired; follow Location.'], ['429 rate_limited', 'retry_after', 'Per-minute limit; Retry-After header.'], ['429 quota_exceeded', 'resets_at', 'Monthly quota; Retry-After until the month resets.'],
      ['500 internal_error', 'request_id', 'Our fault; quote request_id to support.'], ['503 unavailable', '—', 'Maintenance or database unreachable; Retry-After.'],
    ],
    rateLimits: 'Per key: a **per-minute** limit and a **monthly quota** (calendar month, UTC), both from your plan. The sample is limited per source network (30/min, 300/day). Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds) and, for keys, `X-Quota-Limit`, `X-Quota-Remaining`, `X-Quota-Reset`. Over the limit: **429** with `Retry-After`. A 304 or 4xx counts as a request; a 5xx does not. Send `If-None-Match` with the `ETag` you received to get a free 304 when nothing changed.',
    delta: 'The feed `GET /price-changes?since=` returns append-only events ordered by `id`: `price_changed`, `added`, `status_changed`, `removed`, `renamed`. Each event carries the current record (`drug`), so one call updates your copy.\n\n* First sync: load the catalogue with `GET /drugs` (all pages) and store `meta.generated_at`.\n* Every N minutes: `GET /price-changes?since=<stored>`; page with `cursor` (it carries the original `since`); apply each event; store `latest_detected_at`.\n* `since` is inclusive and delivery is at-least-once: skip event ids you already applied.\n* `since` older than your plan\'s window answers **400 since_too_old**: do a full reload.',
    syncLoop: 'Sync loop (JavaScript)', parameters: 'Parameters', responses: 'Responses', example: 'example', errorBodies: <>Error bodies: see <a href="#errors" className="text-primary underline">Errors</a>.</>, noKey: 'no key', oneOf: 'One of:',
    policy: 'Additive changes (new fields, parameters, endpoints, enum values) ship in /v1 and are listed here; clients must ignore unknown fields and values. Breaking changes ship in /v2 with /v1 kept for 12 months and announced with Deprecation and Sunset headers.',
  },
  ar: {
    toc: { 'getting-started': 'البداية', authentication: 'المصادقة', pagination: 'الترقيم', errors: 'الأخطاء', 'rate-limits': 'الحدود', 'delta-sync': 'دليل المزامنة الجزئية', schemas: 'الهياكل', changelog: 'سجل التغييرات' },
    crumb: 'API أسعار الأدوية', here: 'التوثيق', base: 'الرابط الأساسي', conventions: 'JSON بترميز UTF-8 وأسماء snake_case · التغييرات غير المتوافقة فقط في', trySample: 'جرّب العينة', contents: 'المحتويات', referenceNote: 'مرجع نقاط النهاية والهياكل أدناه بالإنجليزية (مولَّد من ملف OpenAPI)؛ الأدلة بالعربية.',
    start: (base: string) => [
      <>جرّب العينة بلا مفتاح: <Code>GET {base}/sample/drugs?q=augmentin</Code> (50 منتجًا ثابتًا بنفس الأشكال، مع <Code>{'"sample": true'}</Code>).</>,
      <><Link prefetch={false} href="/api/request-access" className="text-primary underline">اطلب الوصول</Link>؛ بعد التفعيل أنشئ مفتاحك من <a href={switchHref('/developer', 'ar')} className="text-primary underline">لوحة المطورين</a>. يظهر المفتاح مرة واحدة.</>,
      <>استدعِ نقاط النهاية الحقيقية بالترويسة <Code>Authorization: Bearer dp_live_…</Code>. احتفظ بالمفتاح على الخادم؛ لا تضعه في متصفح أو تطبيق هاتف.</>,
    ],
    firstRequest: 'أول طلب',
    auth: 'كل طلب خارج العينة يحتاج `Authorization: Bearer dp_live_…`. المفتاح المفقود أو غير الصحيح أو المجهول أو الملغى أو المنتهي يعيد **401 unauthorized** (نفس الإجابة دائمًا: لا نكشف السبب). المفتاح الصحيح الذي لا تسمح خطته أو صلاحياته أو قائمة IP بنقطة النهاية يعيد **403 forbidden** مع `details.required_scope` أو `details.plan`.\n\nالمفاتيح: `dp_live_` + 40 حرفًا base32 من 25 بايت عشوائي؛ نخزن تجزئة SHA-256 فقط. الصلاحيات: `drugs:read` و`changes:read` و`export` و`webhooks`. التدوير يبقي المفتاح القديم 24 ساعة؛ الإلغاء فوري.',
    pagination: 'القوائم تأخذ `limit` (1–100، الافتراضي 20) و`cursor` وتعيد `page: { limit, has_more, next_cursor }`. المؤشر نص موقّع غير مقروء، صالح 24 ساعة ومرتبط بالترتيب والمرشحات (تغيير مرشح يعيد **400 invalid_cursor**). القوائم تستخدم مؤشرات keyset تبقى ثابتة مع تغير البيانات؛ نتائج البحث (`q`) مرتبة بالصلة ومحدودة بـ 1,000. لا تحمل القوائم عددًا إجماليًا؛ `/meta` فيه أعداد المجموعة.',
    page2: 'الصفحة الثانية',
    errorsIntro: <>شكل واحد لكل إجابة غير 2xx: <Code>{'{ "error": { "code", "message", "details" } }'}</Code>. <Code>message</Code> للمطورين؛ <Code>details</Code> بنية منظمة (كائن، أو مصفوفة <Code>{'{ param, issue }'}</Code> لأخطاء التحقق، أو <Code>null</Code>).</>,
    errorRows: [
      ['400 validation_error', 'details[]', 'كل معامل غير صحيح مع param وissue.'], ['400 invalid_cursor', '—', 'مؤشر منتهٍ أو تالف أو من مرشحات أخرى.'], ['400 since_too_old', 'window_days', 'since خارج نافذة خطتك: أعد التحميل من /drugs.'],
      ['401 unauthorized', '—', 'مفتاح مفقود أو تالف أو مجهول أو ملغى أو منتهٍ.'], ['403 forbidden', 'plan, required_scope, reason', 'الخطة أو الصلاحية أو حساب موقوف أو اشتراك منتهٍ.'], ['403 ip_not_allowed', '—', 'قائمة IP لخطة Enterprise.'],
      ['404 not_found', '—', 'معرّف أو مسار مجهول.'], ['301 moved', 'new_id + Location', 'المعرّف قديم؛ اتبع Location.'], ['429 rate_limited', 'retry_after', 'حد الدقيقة؛ ترويسة Retry-After.'], ['429 quota_exceeded', 'resets_at', 'الحصة الشهرية؛ Retry-After حتى بداية الشهر.'],
      ['500 internal_error', 'request_id', 'خطأ من جهتنا؛ اذكر request_id للدعم.'], ['503 unavailable', '—', 'صيانة أو قاعدة بيانات غير متاحة؛ Retry-After.'],
    ],
    rateLimits: 'لكل مفتاح: **حد في الدقيقة** و**حصة شهرية** (الشهر التقويمي بتوقيت UTC)، كلاهما من خطتك. العينة محدودة لكل شبكة مصدر (30 في الدقيقة، 300 في اليوم). كل استجابة تحمل `X-RateLimit-Limit` و`X-RateLimit-Remaining` و`X-RateLimit-Reset` (ثوانٍ Unix)، وللمفاتيح `X-Quota-Limit` و`X-Quota-Remaining` و`X-Quota-Reset`. عند التجاوز: **429** مع `Retry-After`. استجابات 304 و4xx تُحسب طلبات؛ 5xx لا تُحسب. أرسل `If-None-Match` بقيمة `ETag` التي استلمتها لتحصل على 304 مجانية عندما لا يتغير شيء.',
    delta: 'التغذية `GET /price-changes?since=` تعيد أحداثًا تُضاف فقط ومرتبة بـ `id`: `price_changed` و`added` و`status_changed` و`removed` و`renamed`. كل حدث يحمل السجل الحالي (`drug`)، فطلب واحد يكفي لتحديث نسختك.\n\n* أول مزامنة: حمّل الكتالوج من `GET /drugs` (كل الصفحات) واحفظ `meta.generated_at`.\n* كل N دقيقة: `GET /price-changes?since=<المحفوظ>`؛ تابع الصفحات بـ `cursor` (يحمل `since` الأصلي)؛ طبّق كل حدث؛ احفظ `latest_detected_at`.\n* `since` شامل والتسليم at-least-once: تجاوز معرّفات الأحداث التي طبّقتها.\n* `since` أقدم من نافذة خطتك يعيد **400 since_too_old**: أعد التحميل كاملًا.',
    syncLoop: 'حلقة المزامنة (JavaScript)', parameters: 'المعاملات', responses: 'الاستجابات', example: 'مثال', errorBodies: <>أجسام الأخطاء: انظر <a href="#errors" className="text-primary underline">الأخطاء</a>.</>, noKey: 'بلا مفتاح', oneOf: 'إحدى القيم:',
    policy: 'التغييرات الإضافية (حقول ومعاملات ونقاط نهاية وقيم جديدة) تصدر في /v1 وتُسجَّل هنا؛ على العملاء تجاهل الحقول والقيم المجهولة. التغييرات غير المتوافقة تصدر في /v2 مع إبقاء /v1 اثني عشر شهرًا والإعلان بترويستي Deprecation وSunset.',
  },
};

export function DocsPage({ lang }: { lang: Lang }) {
  const docs = getApiDocs();
  const base = apiPublicBase();
  const g = GUIDES[lang];
  const ar = lang === 'ar';
  const h2 = 'type-h2 mt-12 scroll-mt-20 border-b border-border pb-2 text-ink';
  const h3 = 'mt-6 scroll-mt-20 text-lg font-semibold text-ink';
  const toc: Array<[string, string]> = [
    ...(['getting-started', 'authentication', 'pagination', 'errors', 'rate-limits', 'delta-sync'] as const).map((k) => [k, g.toc[k]] as [string, string]),
    ...docs.tags.map((t) => [`tag-${t.name.toLowerCase()}`, t.name] as [string, string]),
    ['schemas', g.toc.schemas], ['changelog', g.toc.changelog],
  ];
  const ltr = { dir: 'ltr' as const, lang: 'en' as const };
  return (
    <>
      <ApiNav current={ar ? '/api/docs' : '/api/en/docs'} lang={lang} />
      <Container className="py-6 md:py-10">
        <Breadcrumbs lang={lang} items={[{ name: g.crumb, href: ar ? '/api' : '/api/en' }, { name: g.here }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-h1 text-ink">{ar ? 'توثيق الـ API' : docs.title} <span className="text-text-2">v{docs.version}</span></h1>
            <p className="mt-2 max-w-3xl text-text-2">{g.base} <Code>{base}</Code> · {g.conventions} <Code>/v2</Code></p>
            {g.referenceNote && <p className="type-small mt-1 text-text-2">{g.referenceNote}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href={ar ? '/api/sample' : '/api/en/sample'} className={buttonClass('primary')}>{g.trySample}</Link>
            <a href="/api/openapi.yaml" className={buttonClass('secondary')}>openapi.yaml</a>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label={g.contents} className="lg:sticky lg:top-6 lg:self-start">
            <ul className="space-y-0.5 rounded-card border border-border p-2 text-sm">
              {toc.map(([id, label]) => (
                <li key={id}><a href={`#${id}`} className="block rounded-control-sm px-2 py-1.5 text-text-2 hover:bg-surface hover:text-primary">{label}</a></li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <h2 id="getting-started" className={cx(h2, 'mt-0')}>{g.toc['getting-started']}</h2>
            <ol className="mt-3 list-decimal space-y-2 ps-5 text-text-2">{g.start(base).map((s, i) => <li key={i}>{s}</li>)}</ol>
            <CodeBlock className="mt-4" lang={lang} title={g.firstRequest} code={snippet('curl', `${base}/drugs/by-barcode/6221051011317`, 'dp_live_YOUR_KEY')} />
            {!ar && <Markdown className="mt-4" text={docs.description} />}

            <h2 id="authentication" className={h2}>{g.toc.authentication}</h2>
            <Markdown className="mt-3" text={g.auth} />

            <h2 id="pagination" className={h2}>{g.toc.pagination}</h2>
            <Markdown className="mt-3" text={g.pagination} />
            <CodeBlock className="mt-3" lang={lang} title={g.page2} code={`GET ${base}/drugs?dosage_form=syrup&limit=100&cursor=eyJmIjoi…\n\n{ "data": [ … ], "page": { "limit": 100, "has_more": true, "next_cursor": "eyJmIjoi…" },\n  "meta": { "dataset_version": "2026-10-21.1", "generated_at": "2026-10-21T14:36:16Z" } }`} />

            <h2 id="errors" className={h2}>{g.toc.errors}</h2>
            <p className="mt-3 text-text-2">{g.errorsIntro}</p>
            <FieldTable lang={lang} caption={g.toc.errors} rows={g.errorRows.map(([name, type, description]) => ({ name, type, description }))} />

            <h2 id="rate-limits" className={h2}>{g.toc['rate-limits']}</h2>
            <Markdown className="mt-3" text={g.rateLimits} />

            <h2 id="delta-sync" className={h2}>{g.toc['delta-sync']}</h2>
            <Markdown className="mt-3" text={g.delta} />
            <CodeBlock className="mt-3" lang={lang} title={g.syncLoop} code={`let since = stored.latest_detected_at;        // from the previous run\nlet cursor = null;\ndo {\n  const url = cursor ? \`${base}/price-changes?cursor=\${encodeURIComponent(cursor)}\`\n                     : \`${base}/price-changes?since=\${since}&limit=100\`;\n  const page = await (await fetch(url, { headers: { Authorization: "Bearer " + KEY } })).json();\n  for (const e of page.data) {\n    if (e.id <= stored.last_event_id) continue;       // at-least-once: skip what you applied\n    applyEvent(e);                                     // e.type, e.data, e.drug (current record)\n    stored.last_event_id = e.id;\n  }\n  if (page.latest_detected_at) stored.latest_detected_at = page.latest_detected_at;\n  cursor = page.page.next_cursor;\n} while (cursor);`} />

            <div {...(ar ? ltr : {})} className={ar ? 'text-start' : undefined}>
              {docs.tags.map((tag) => (
                <section key={tag.name} aria-labelledby={`tag-${tag.name.toLowerCase()}`}>
                  <h2 id={`tag-${tag.name.toLowerCase()}`} className={h2}>{tag.name}</h2>
                  {tag.description && <p className="mt-2 text-text-2">{tag.description}</p>}
                  {tag.operations.map((op) => (
                    <article key={op.id} id={op.id} className="mt-6 scroll-mt-20 rounded-card border border-border p-4 md:p-5">
                      <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                        <Badge tone={METHOD_TONE[op.method] ?? 'neutral'}>{op.method}</Badge>
                        <code className="font-mono">{op.path}</code>
                        {!op.auth && <Badge tone="neutral">{g.noKey}</Badge>}
                      </h3>
                      <p className="mt-1 font-medium text-ink">{op.summary}</p>
                      {op.description && <Markdown className="mt-2" text={op.description} />}
                      {op.params.length > 0 && (
                        <>
                          <h4 className="mt-4 text-sm font-semibold text-text-2">{g.parameters}</h4>
                          <FieldTable lang="en" caption={`${op.method} ${op.path} parameters`} rows={op.params.map((p) => ({ name: `${p.name} (${p.in})`, type: p.type, required: p.required, description: p.description, example: p.example }))} />
                        </>
                      )}
                      <h4 className="mt-4 text-sm font-semibold text-text-2">{g.responses}</h4>
                      <ul className="mt-1 space-y-1">
                        {op.responses.map((r) => (
                          <li key={r.status} className="text-text-2">
                            <span className="font-mono font-semibold text-ink">{r.status}</span> {r.description}{r.schema && <> → <Code>{r.schema}</Code></>}
                            {r.example && /^[23]/.test(r.status) && (
                              <details className="mt-1">
                                <summary className="tap inline-flex cursor-pointer items-center text-sm text-primary">{g.example}</summary>
                                <CodeBlock className="mt-1" lang="en" code={r.example} />
                              </details>
                            )}
                          </li>
                        ))}
                        {op.responses.some((r) => /^[45]/.test(r.status)) && <li className="type-small text-text-2">{g.errorBodies}</li>}
                      </ul>
                      <CodeBlock className="mt-4" lang="en" title="curl" code={snippet('curl', `${base}${op.path.replace(/\{(\w+)\}/g, (_, k) => (k === 'id' ? 'congestal-20-tabs' : k === 'barcode' ? '6221051011317' : `{${k}}`))}`, op.auth ? 'dp_live_YOUR_KEY' : null)} />
                    </article>
                  ))}
                </section>
              ))}

              <h2 id="schemas" className={h2}>{g.toc.schemas}</h2>
              {docs.schemas.map((s) => (
                <section key={s.name} id={`schema-${s.name.toLowerCase()}`} className="scroll-mt-20">
                  <h3 className={h3}>{s.name}</h3>
                  {s.description && <p className="mt-1 text-text-2">{s.description}</p>}
                  {s.values ? (
                    <p className="mt-2 text-text-2">{g.oneOf} {s.values.map((v, i) => <span key={v}>{i > 0 && ', '}<Code>{v}</Code></span>)}</p>
                  ) : s.fields.length > 0 ? (
                    <div className="mt-2"><FieldTable lang="en" caption={`${s.name} fields`} rows={s.fields.map((f) => ({ name: f.name, type: f.type, required: f.required, description: f.description, example: f.example }))} /></div>
                  ) : null}
                  {s.example && (
                    <details className="mt-2">
                      <summary className="tap inline-flex cursor-pointer items-center text-sm text-primary">{g.example}</summary>
                      <CodeBlock className="mt-1" lang="en" code={s.example} />
                    </details>
                  )}
                </section>
              ))}
            </div>

            <h2 id="changelog" className={h2}>{g.toc.changelog}</h2>
            <ul className="mt-3 space-y-3">
              {CHANGELOG.map((c) => (
                <li key={c.version}>
                  <p className="font-semibold text-ink">{c.version} <span className="type-small font-normal text-text-2">— {c.date}</span></p>
                  <p className="text-text-2">{ar ? c.ar : c.en}</p>
                </li>
              ))}
            </ul>
            <p className="type-small mt-6 text-text-2">{g.policy}</p>
          </div>
        </div>
      </Container>
    </>
  );
}
