'use client';

// Interactive sample explorer (/api/sample): pick an endpoint, set parameters, run it against
// /api/v1/sample/* (keyless, sample data only), read the JSON and copy a snippet.
import { useMemo, useState } from 'react';
import { CopyButton } from './CopyButton';
import { buttonClass, cx } from '../ui';
import { EXPLORER_ENDPOINTS, LANGS, explorerUrl, snippet, type Lang } from '@/lib/api/snippets';

const field = 'min-h-11 w-full rounded-control border border-border bg-bg px-3 text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-tint';

interface Result {
  status: number;
  ms: number;
  headers: Array<[string, string]>;
  body: string;
}

export function SampleExplorer({ publicBase, lang = 'ar' }: { publicBase: string; lang?: 'ar' | 'en' }) {
  const [endpointId, setEndpointId] = useState(EXPLORER_ENDPOINTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [snippetLang, setSnippetLang] = useState<Lang>('curl');
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const endpoint = EXPLORER_ENDPOINTS.find((e) => e.id === endpointId)!;
  const localUrl = useMemo(() => explorerUrl('/api/v1', endpoint, values), [endpoint, values]);
  const publicUrl = useMemo(() => explorerUrl(publicBase, endpoint, values), [publicBase, endpoint, values]);
  const t = lang === 'ar'
    ? { endpoint: 'نقطة النهاية', params: 'المعاملات', run: 'نفّذ الطلب', running: 'جارٍ التنفيذ…', response: 'الاستجابة', snippet: 'الكود', request: 'الطلب', status: 'الحالة', time: 'الزمن', headers: 'ترويسات مهمة', hint: 'كل الاستجابات هنا من عينة ثابتة من 50 دواءً وتحمل "sample": true. المفتاح الحقيقي يفتح الكتالوج كاملًا بنفس الأشكال.' }
    : { endpoint: 'Endpoint', params: 'Parameters', run: 'Run request', running: 'Running…', response: 'Response', snippet: 'Code', request: 'Request', status: 'Status', time: 'Time', headers: 'Notable headers', hint: 'Every response here comes from a fixed sample of 50 drugs and carries "sample": true. A real key opens the full catalogue with the same shapes.' };

  async function run() {
    setRunning(true);
    const started = performance.now();
    try {
      const res = await fetch(localUrl, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON */
      }
      const keep = ['x-sample', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'cache-control', 'etag', 'content-type'];
      setResult({ status: res.status, ms: Math.round(performance.now() - started), headers: keep.filter((h) => res.headers.get(h)).map((h) => [h, res.headers.get(h)!]), body });
    } catch (e) {
      setResult({ status: 0, ms: Math.round(performance.now() - started), headers: [], body: String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form
        className="space-y-4 rounded-card border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div>
          <label htmlFor="ex-endpoint" className="mb-1 block font-medium text-ink">{t.endpoint}</label>
          <select
            id="ex-endpoint"
            value={endpointId}
            onChange={(e) => {
              setEndpointId(e.target.value);
              setValues({});
              setResult(null);
            }}
            className={field}
          >
            {EXPLORER_ENDPOINTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.method} {e.path} — {lang === 'ar' ? e.titleAr : e.title}
              </option>
            ))}
          </select>
        </div>
        {endpoint.params.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="font-medium text-ink">{t.params}</legend>
            {endpoint.params.map((p) => (
              <div key={p.name}>
                <label htmlFor={`ex-${p.name}`} className="type-small mb-1 block text-text-2" dir="ltr">
                  {p.label} <span className="text-muted">({p.in})</span>
                </label>
                {p.options ? (
                  <select id={`ex-${p.name}`} value={values[p.name] ?? p.default ?? p.options[0]} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} className={field} dir="ltr">
                    {p.options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                ) : (
                  <input id={`ex-${p.name}`} value={values[p.name] ?? p.default ?? ''} placeholder={p.placeholder} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} className={field} dir="ltr" />
                )}
              </div>
            ))}
          </fieldset>
        )}
        <button type="submit" disabled={running} className={buttonClass('primary', 'w-full')}>{running ? t.running : t.run}</button>
        <p className="type-small text-text-2">{t.hint}</p>
      </form>

      <div className="min-w-0 space-y-4">
        <section aria-labelledby="ex-request" className="overflow-hidden rounded-card border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-1.5">
            <h2 id="ex-request" className="type-small font-medium text-text-2">{t.request}</h2>
            <CopyButton text={publicUrl} label={lang === 'ar' ? 'نسخ الرابط' : 'Copy URL'} copiedLabel={lang === 'ar' ? 'تم' : 'Copied'} />
          </div>
          <p dir="ltr" className="overflow-x-auto px-3 py-2 text-start font-mono text-sm text-ink">
            <span className="font-semibold text-primary">GET</span> {publicUrl}
          </p>
        </section>

        <section aria-labelledby="ex-snippet" className="overflow-hidden rounded-card border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
            <h2 id="ex-snippet" className="type-small font-medium text-text-2">{t.snippet}</h2>
            <div role="tablist" aria-label={t.snippet} className="flex flex-wrap gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={snippetLang === l.id}
                  onClick={() => setSnippetLang(l.id)}
                  className={cx('tap rounded-control-sm px-2.5 text-sm font-medium', snippetLang === l.id ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-primary-tint hover:text-primary')}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <CopyButton text={snippet(snippetLang, publicUrl, null)} label={lang === 'ar' ? 'نسخ' : 'Copy'} copiedLabel={lang === 'ar' ? 'تم' : 'Copied'} />
          </div>
          <pre dir="ltr" role="tabpanel" className="overflow-x-auto p-3 text-start font-mono text-sm leading-relaxed text-ink">
            <code>{snippet(snippetLang, publicUrl, null)}</code>
          </pre>
        </section>

        <section aria-labelledby="ex-response" aria-live="polite" className="overflow-hidden rounded-card border border-border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-3 py-1.5">
            <h2 id="ex-response" className="type-small font-medium text-text-2">{t.response}</h2>
            {result && (
              <>
                <span className={cx('type-small font-mono font-semibold', result.status >= 200 && result.status < 300 ? 'text-down' : 'text-up')} dir="ltr">{t.status} {result.status}</span>
                <span className="type-small font-mono text-text-2" dir="ltr">{t.time} {result.ms} ms</span>
                {result.body && <CopyButton className="ms-auto" text={result.body} label={lang === 'ar' ? 'نسخ' : 'Copy'} copiedLabel={lang === 'ar' ? 'تم' : 'Copied'} />}
              </>
            )}
          </div>
          {result && result.headers.length > 0 && (
            <dl dir="ltr" className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-border px-3 py-2 font-mono text-xs text-text-2">
              {result.headers.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="truncate">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <pre dir="ltr" className="max-h-[32rem] min-h-24 overflow-auto p-3 text-start font-mono text-sm leading-relaxed text-ink">
            <code>{result ? result.body : lang === 'ar' ? '// اضغط «نفّذ الطلب»' : '// press "Run request"'}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
