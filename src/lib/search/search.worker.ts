/// <reference lib="webworker" />
// The search worker: downloads the suggestion index (through the Cache API, so a repeat visit
// needs no network), parses it, builds the engine and answers queries. The page's main thread
// only sends the query and renders the answer (lib/search/client.ts).
import { SearchEngine, SUGGESTION_LIMIT } from './engine';
import { SEARCH_INDEX_VERSION, type SearchIndexFile, type Suggestion } from './index-format';

/** Cache API bucket; older index versions are deleted from it when a new one is stored. */
export const SEARCH_CACHE_NAME = 'dw-search-index';

export type WorkerRequest = { t: 'load'; url: string } | { t: 'q'; id: number; q: string; limit?: number };
export type WorkerResponse =
  | { t: 'ready'; from: 'cache' | 'network'; bytes: number; transferBytes: number | null; loadMs: number; buildMs: number; n: number }
  | { t: 'error'; message: string }
  | { t: 'r'; id: number; items: Suggestion[] };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: SearchEngine | null = null;

const post = (m: WorkerResponse) => scope.postMessage(m);

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches !== 'undefined' ? await caches.open(SEARCH_CACHE_NAME) : null;
  } catch {
    return null; // private mode / storage blocked: fetch every time
  }
}

async function fetchIndex(url: string): Promise<{ res: Response; from: 'cache' | 'network' }> {
  const cache = await openCache();
  if (cache) {
    const hit = await cache.match(url).catch(() => undefined);
    if (hit) return { res: hit, from: 'cache' };
  }
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`index HTTP ${res.status}`);
  if (cache) {
    try {
      await cache.put(url, res.clone());
      const current = new URL(url, scope.location.href).href;
      for (const req of await cache.keys()) if (req.url !== current) await cache.delete(req);
    } catch {
      /* quota or storage error: the copy in memory is enough for this page */
    }
  }
  return { res, from: 'network' };
}

async function load(url: string): Promise<void> {
  const started = performance.now();
  const { res, from } = await fetchIndex(url);
  const transfer = res.headers.get('content-length');
  const text = await res.text();
  const index = JSON.parse(text) as SearchIndexFile;
  if (index.v !== SEARCH_INDEX_VERSION || !Array.isArray(index.slug)) throw new Error('index format');
  const loadMs = performance.now() - started;
  const t = performance.now();
  engine = new SearchEngine(index);
  post({ t: 'ready', from, bytes: text.length, transferBytes: transfer ? Number(transfer) : null, loadMs: Math.round(loadMs), buildMs: Math.round(performance.now() - t), n: engine.size });
}

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.t === 'load') {
    load(m.url).catch((err: unknown) => post({ t: 'error', message: err instanceof Error ? err.message : String(err) }));
  } else if (m.t === 'q') {
    post({ t: 'r', id: m.id, items: engine ? engine.search(m.q, m.limit ?? SUGGESTION_LIMIT) : [] });
  }
};
