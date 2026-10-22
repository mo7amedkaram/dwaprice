// Main-thread side of the instant suggestions: one shared client per page that owns the search
// worker, decides when the index loads, and answers `suggest()` from the index when it is ready
// or from /api/search while it is not (lib/search/search.worker.ts does the heavy work).
//
// Loading (never during the initial page load):
//   * `prefetchWhenIdle()` (home and search pages): after the load event, in an idle callback
//     (4 s timeout); skipped when the browser asks to save data or reports a 2G connection.
//   * `warm()` (every page): the moment the user focuses, hovers or touches the search box.
//   * The worker keeps the file in the Cache API, keyed by its hashed URL: repeat visits use
//     the cached copy with zero network; older versions are deleted. A failed load falls back
//     to the server and is retried once, 5 s later.
// Fallback while loading: GET /api/search for the first 2 characters (50 results), cached in
// memory by those 2 characters, then filtered locally for the following keystrokes; a request
// still in flight is aborted when the first 2 characters change.
import { MIN_QUERY_CHARS, SUGGESTION_LIMIT } from './engine-shared';
import { SEARCH_INDEX_PATH, type Suggestion } from './index-format';
import { normalizeSearch } from './normalize';
import type { WorkerRequest, WorkerResponse } from './search.worker';

export type SearchStatus = 'unavailable' | 'idle' | 'loading' | 'ready' | 'failed';
export type SuggestionSource = 'index' | 'server';
export interface SuggestResult {
  items: Suggestion[];
  source: SuggestionSource;
}

/** Hashed file name of the build-time index, inlined at build (next.config.ts); '' = none built. */
const INDEX_FILE = process.env.NEXT_PUBLIC_SEARCH_INDEX || '';
/** Build-time static index: the first-load fallback when the live route is unreachable. */
export const INDEX_URL = INDEX_FILE ? `${SEARCH_INDEX_PATH}/${INDEX_FILE}` : null;
/** Live, database-built index and its tiny version marker (freshness without a deploy). */
const VERSION_URL = `${SEARCH_INDEX_PATH}/version.json`;
const CURRENT_URL = `${SEARCH_INDEX_PATH}/current.json`;
const FALLBACK_LIMIT = 50;
const RETRY_MS = 5000;

interface ServerHit {
  slug: string;
  name_ar: string | null;
  name_en: string;
  dosage_form_ar: string | null;
}

interface DebugInfo {
  ready: boolean;
  status: SearchStatus;
  url: string | null;
  from: 'cache' | 'network' | null;
  bytes: number | null;
  transferBytes: number | null;
  loadMs: number | null;
  buildMs: number | null;
  startedBy: 'idle' | 'focus' | null;
  readyAt: number | null;
  error: string | null;
}

declare global {
  interface Window {
    /** Diagnostics for scripts/search-timing.mjs and friends (no personal data). */
    __dwSearch?: DebugInfo;
  }
}

/** Save-Data or a 2G connection: do not prefetch (the index still loads on focus). */
export function shouldSkipPrefetch(nav: Navigator = navigator): boolean {
  const c = (nav as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/** Tokens of the normalised query all start a word of the hit (or the query is inside a name). */
export function matchesLocally(hit: Suggestion, normalizedQuery: string): boolean {
  const nar = normalizeSearch(hit.ar);
  const nen = normalizeSearch(hit.en);
  const words = `${nar} ${nen}`.split(' ');
  const ok = normalizedQuery.split(' ').every((q) => words.some((w) => w.startsWith(q)));
  return ok || (normalizedQuery.length >= 3 && (nar.includes(normalizedQuery) || nen.includes(normalizedQuery)));
}

export function toSuggestion(hit: ServerHit): Suggestion {
  return { slug: hit.slug, ar: hit.name_ar ?? hit.name_en, en: hit.name_en, form: hit.dosage_form_ar, ingredient: null, tier: -1 };
}

export class SearchClient {
  // The live route is built from the database on demand, so an index is always reachable even when
  // no build-time file was inlined; 'idle' until the user's intent (focus) or the idle prefetch.
  status: SearchStatus = 'idle';
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, (items: Suggestion[]) => void>();
  private retried = false;
  private readonly listeners = new Set<(status: SearchStatus) => void>();
  private readonly serverCache = new Map<string, Suggestion[]>();
  private abort: AbortController | null = null;
  // Full-text fallback (when the 2-char prefix response was truncated): debounced + aborted + cached.
  private readonly fullCache = new Map<string, Suggestion[]>();
  private fullTimer: ReturnType<typeof setTimeout> | undefined;
  private fullAbort: AbortController | null = null;
  private fullPending: ((items: Suggestion[]) => void) | null = null;
  private readonly debug: DebugInfo = { ready: false, status: this.status, url: INDEX_URL, from: null, bytes: null, transferBytes: null, loadMs: null, buildMs: null, startedBy: null, readyAt: null, error: null };

  constructor() {
    this.publish();
  }

  onStatus(fn: (status: SearchStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Start loading now (user intent: focus, hover, touch). */
  warm(): void {
    if (this.status === 'idle') this.load('focus');
  }

  /** Load after the page is idle, unless the connection asks for restraint. */
  prefetchWhenIdle(): void {
    if (this.status !== 'idle' || shouldSkipPrefetch()) return;
    const start = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(() => this.status === 'idle' && this.load('idle'), { timeout: 4000 });
      else setTimeout(() => this.status === 'idle' && this.load('idle'), 1500);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  /** Suggestions for the typed text: from the index when ready, else from the server. */
  async suggest(raw: string): Promise<SuggestResult> {
    const term = raw.trim();
    if (term.length < MIN_QUERY_CHARS) return { items: [], source: this.status === 'ready' ? 'index' : 'server' };
    if (this.status === 'ready' && this.worker) return { items: await this.query(term), source: 'index' };
    return { items: await this.fromServer(term), source: 'server' };
  }

  /** The index URL to load: the live current.json at its current version, else the build-time file. */
  private async resolveUrl(): Promise<string | null> {
    try {
      const res = await fetch(VERSION_URL, { credentials: 'omit' });
      if (res.ok) {
        const { hash } = (await res.json()) as { hash?: string };
        // The content hash makes each version its own immutable URL, so the worker's Cache API
        // reuses an unchanged index and downloads a new one only when the catalogue changed.
        if (hash) return `${CURRENT_URL}?v=${encodeURIComponent(hash)}`;
      }
    } catch {
      /* offline or route down: fall back to the build-time static index */
    }
    return INDEX_URL;
  }

  private load(startedBy: 'idle' | 'focus'): void {
    this.debug.startedBy = startedBy;
    this.setStatus('loading');
    void this.resolveUrl().then((url) => {
      if (!url) {
        this.fail('no index url');
        return;
      }
      this.debug.url = url;
      try {
        this.worker = new Worker(new URL('./search.worker.ts', import.meta.url));
      } catch (err) {
        this.fail(err instanceof Error ? err.message : 'worker');
        return;
      }
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.t === 'ready') {
          Object.assign(this.debug, { from: m.from, bytes: m.bytes, transferBytes: m.transferBytes, loadMs: m.loadMs, buildMs: m.buildMs, readyAt: Math.round(performance.now()), error: null });
          this.setStatus('ready');
        } else if (m.t === 'error') {
          this.fail(m.message);
        } else if (m.t === 'r') {
          this.pending.get(m.id)?.(m.items);
          this.pending.delete(m.id);
        }
      };
      this.worker.onerror = () => this.fail('worker error');
      this.post({ t: 'load', url });
    });
  }

  private fail(message: string): void {
    this.debug.error = message;
    this.worker?.terminate();
    this.worker = null;
    for (const resolve of this.pending.values()) resolve([]);
    this.pending.clear();
    this.setStatus('failed');
    if (!this.retried) {
      this.retried = true;
      setTimeout(() => {
        if (this.status === 'failed') {
          this.status = 'idle';
          this.load(this.debug.startedBy ?? 'idle');
        }
      }, RETRY_MS);
    }
  }

  private post(m: WorkerRequest): void {
    this.worker?.postMessage(m);
  }

  private query(term: string): Promise<Suggestion[]> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ t: 'q', id, q: term, limit: SUGGESTION_LIMIT });
    });
  }

  private async fromServer(term: string): Promise<Suggestion[]> {
    const nq = normalizeSearch(term);
    if (nq.length < MIN_QUERY_CHARS) return [];
    const key = nq.slice(0, 2).trim();
    if (key.length < MIN_QUERY_CHARS) return [];
    const prefix = await this.prefixResults(key);
    if (prefix === null) return []; // aborted or offline
    // The 2-char prefix response is capped at FALLBACK_LIMIT, so filtering that truncated list
    // locally for a longer query can wrongly return nothing (the "كونجستال" bug). Ask the server
    // for the full text when the list was capped, OR when the local filter finds nothing but the
    // query is longer than the prefix — the match may simply have been past the cap.
    if (prefix.length >= FALLBACK_LIMIT && nq.length > key.length) return this.fullResults(nq);
    const local = prefix.filter((hit) => matchesLocally(hit, nq)).slice(0, SUGGESTION_LIMIT);
    if (local.length === 0 && nq.length > key.length) return this.fullResults(nq);
    return local;
  }

  /** Cached top-50 for a 2-character prefix; null on error/abort. */
  private async prefixResults(key: string): Promise<Suggestion[] | null> {
    const cached = this.serverCache.get(key);
    if (cached) return cached;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(key)}&limit=${FALLBACK_LIMIT}`, { signal: controller.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { results: ServerHit[] };
      const list = data.results.map(toSuggestion);
      this.serverCache.set(key, list);
      return list;
    } catch {
      return null;
    }
  }

  /** Server results for the full query — debounced 100 ms, previous request aborted, cached per full query. */
  private fullResults(nq: string): Promise<Suggestion[]> {
    const cached = this.fullCache.get(nq);
    if (cached) return Promise.resolve(cached);
    this.fullPending?.([]); // resolve the superseded waiter so it never hangs
    clearTimeout(this.fullTimer);
    this.fullAbort?.abort();
    return new Promise((resolve) => {
      this.fullPending = resolve;
      this.fullTimer = setTimeout(async () => {
        this.fullPending = null;
        const controller = new AbortController();
        this.fullAbort = controller;
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(nq)}&limit=${SUGGESTION_LIMIT}`, { signal: controller.signal });
          if (!res.ok) return resolve([]);
          const data = (await res.json()) as { results: ServerHit[] };
          const items = data.results.map(toSuggestion);
          this.fullCache.set(nq, items);
          resolve(items);
        } catch {
          resolve([]); // aborted (superseded) or offline
        }
      }, 100);
    });
  }

  private setStatus(status: SearchStatus): void {
    this.status = status;
    this.publish();
    for (const fn of this.listeners) fn(status);
  }

  private publish(): void {
    this.debug.status = this.status;
    this.debug.ready = this.status === 'ready';
    if (typeof window !== 'undefined') window.__dwSearch = this.debug;
  }
}

let client: SearchClient | null = null;

/** The page's shared search client (browser only). */
export function getSearchClient(): SearchClient {
  client ??= new SearchClient();
  return client;
}
