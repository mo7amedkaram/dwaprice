'use client';

// Search field with instant suggestions (WAI-ARIA 1.2 combobox + listbox) and voice input.
// Suggestions come from the local index inside a Web Worker once it is loaded (lib/search/client.ts:
// no debounce, no server round trip; every keystroke is answered in a few milliseconds) and from
// /api/search until then. Submitting goes to /search?q= (the results page keeps using the server).
// - keyboard: ↓/↑ move (wrapping), Enter opens the active option (or submits), Escape closes
//   then clears, Tab leaves; the last option is "all results";
// - no layout shift: the list is absolutely positioned over the content and the result count is
//   announced through a visually hidden live region;
// - `prefetch`: load the index when the page is idle (home and search pages). Every box also
//   loads it the moment the field is focused, hovered or touched.
// - voice: the microphone button (components/search/VoiceButton) puts interim text in the field
//   live, so suggestions follow the speech; a strong top match is pre-selected, never opened.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchIcon } from './icons';
import { tradeName } from '@/lib/format';
import { track } from '@/lib/analytics';
import { routes } from '@/lib/site';
import { cx } from './ui';
import { isWildcardQuery, MAX_QUERY_CHARS, MIN_QUERY_CHARS, PRESELECT_MAX_TIER, WILDCARD_HINT, WILDCARD_HINT_KEY, WILDCARD_HINT_SHOWS } from '@/lib/search/constants';
import type { Suggestion } from '@/lib/search/index-format';
import type { Segment } from '@/lib/search/wildcard';
import { VoiceButton } from './search/VoiceButton';
import { VOICE_MESSAGES, type VoiceEvent } from './search/voice-detect';

// The suggestion engine and client load on the first focus/hover, never on the first page load.
// One shared chunk and one shared client across every SearchBox instance on the page.
type SuggestModule = typeof import('@/lib/search/suggest');
let suggestModule: Promise<SuggestModule> | null = null;
const loadSuggest = (): Promise<SuggestModule> => (suggestModule ??= import('@/lib/search/suggest'));

const PLACEHOLDER = 'ابحث باسم الدواء أو المادة الفعالة';
const LISTENING_PLACEHOLDER = 'اتكلم دلوقتي…';
const MAX_LENGTH = MAX_QUERY_CHARS;
type HighlightFn = (text: string, query: string) => Segment[];

/** The display string with what the query matched wrapped in <mark>: whole words, or — for a
 * wildcard pattern — only the letters the visitor typed inside the matching word. */
function Highlight({ text, query, highlight }: { text: string; query: string; highlight: HighlightFn | null }) {
  if (!highlight) return <>{text}</>;
  return (
    <>
      {highlight(text, query).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-sm bg-primary-tint text-inherit">
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

/** How many times the wildcard hint was shown in this browser (localStorage; 0 when unavailable). */
function hintShows(): number {
  try {
    return Number(localStorage.getItem(WILDCARD_HINT_KEY)) || 0;
  } catch {
    return WILDCARD_HINT_SHOWS; // storage blocked: never nag
  }
}
function countHintShow(n: number): void {
  try {
    localStorage.setItem(WILDCARD_HINT_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
}

/** The "؟" popover: the two symbols with examples. */
function WildcardHelp({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div id={id} role="dialog" aria-label="طريقة البحث بالنجمة" className="absolute end-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-bg p-4 text-start shadow-lg">
      <p className="font-semibold text-ink">مش قاري الاسم كله؟</p>
      <p className="type-small mt-1 text-text-2">اكتب الحروف اللي عارفها وحط رمزًا مكان الباقي:</p>
      <dl className="type-small mt-2 space-y-1.5 text-text-2">
        <div className="flex gap-2">
          <dt className="w-8 shrink-0 text-center font-mono text-lg leading-5 text-ink" dir="ltr">*</dt>
          <dd>أي عدد من الحروف — <code dir="ltr">Au*in</code> يجد Augmentin وAutrin</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-8 shrink-0 text-center font-mono text-lg leading-5 text-ink" dir="ltr">?</dt>
          <dd>حرف واحد بالضبط — <code dir="ltr">Br?fen</code> يجد Brufen</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-8 shrink-0 text-center text-ink">ع</dt>
          <dd>بالعربي كمان — <code dir="ltr">أو*ين</code> يجد أوجمنتين</dd>
        </div>
      </dl>
      <p className="type-small mt-2 text-muted">حرفان على الأقل، وحتى 3 رموز.</p>
      <button type="button" onClick={onClose} className="tap mt-2 inline-flex min-h-9 items-center rounded-control border border-border px-3 text-sm font-medium text-text-2 hover:text-ink">
        فهمت
      </button>
    </div>
  );
}

export function SearchBox({ id, size = 'md', autoFocus = false, prefetch = false }: { id?: string; size?: 'md' | 'lg'; autoFocus?: boolean; prefetch?: boolean }) {
  const reactId = useId();
  const inputId = id ?? `search-${reactId}`;
  const listId = `${inputId}-list`;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  /** The term the shown items answer (highlighting follows it, not a newer keystroke). */
  const [shownFor, setShownFor] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const seq = useRef(0);
  const mod = useRef<SuggestModule | null>(null);
  const [highlight, setHighlight] = useState<HighlightFn | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Part 2: on phones, keep the suggestions in the space between the input and the keyboard.
  const boxRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [listMaxH, setListMaxH] = useState<number | null>(null);
  const termRef = useRef('');
  const reRun = useRef<() => void>(() => {});
  const subscribed = useRef(false);
  // Wildcard search: the first-3-focuses hint, the "؟" help popover, one GA event per pattern.
  const [hint, setHint] = useState(false);
  const [help, setHelp] = useState(false);
  const helpId = `${inputId}-help`;
  const trackedPattern = useRef('');

  const term = q.trim();
  // Options: the suggestions, then "all results for …".
  const optionCount = items.length > 0 ? items.length + 1 : 0;

  // Load the suggestion engine + client (one shared chunk) on first need; cache it in the ref.
  // When the index finishes loading, re-run the current query against it, so a drug that is in the
  // index never stays showing "no results" from a stale fallback answer (Part B.3).
  const ensure = useCallback(async (): Promise<SuggestModule> => {
    if (!mod.current) {
      mod.current = await loadSuggest();
      setHighlight(() => mod.current!.highlightSegments);
      if (!subscribed.current) {
        subscribed.current = true;
        mod.current.getSearchClient().onStatus((status) => {
          if (status === 'ready') reRun.current();
        });
      }
    }
    return mod.current;
  }, []);

  useEffect(() => {
    // Idle prefetch (home/search) happens after hydration, so the chunk is not on the first load.
    if (prefetch) void ensure().then((m) => m.getSearchClient().prefetchWhenIdle());
  }, [prefetch, ensure]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // The help popover closes on Escape and on a click anywhere outside the search box.
  useEffect(() => {
    if (!help) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelp(false);
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.parentElement?.contains(e.target as Node)) setHelp(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [help]);

  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

  // Size the dropdown to the space above the on-screen keyboard (visualViewport), its own scroll.
  const syncViewport = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const box = boxRef.current;
    if (!vv || !box || !isMobile()) {
      setListMaxH(null);
      return;
    }
    const bottom = box.getBoundingClientRect().bottom; // layout-viewport relative
    const available = vv.offsetTop + vv.height - bottom - 12; // offsetTop corrects for the visual viewport
    setListMaxH(Math.max(140, Math.round(available)));
  }, []);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!focused || !vv || !isMobile()) return;
    const raf = requestAnimationFrame(syncViewport); // first measure off the effect body
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    };
  }, [focused, syncViewport]);

  const clear = useCallback(() => {
    seq.current++;
    setItems([]);
    setOpen(false);
    setActive(-1);
    setStatus('');
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
  }, []);

  const show = useCallback((results: Suggestion[], forTerm: string, preselectStrong: boolean) => {
    setItems(results);
    setShownFor(forTerm);
    setOpen(results.length > 0);
    setActive(preselectStrong && results.length > 0 && results[0].tier >= 0 && results[0].tier <= PRESELECT_MAX_TIER ? 0 : -1);
    setStatus(results.length > 0 ? `${results.length} اقتراحات متاحة، استخدم الأسهم للتنقل` : 'لا توجد اقتراحات');
  }, []);

  /** Suggestions for `value`; answers superseded by a newer keystroke are dropped. */
  const runSearch = useCallback(
    async (value: string, preselectStrong = false): Promise<Suggestion[] | null> => {
      const t = value.trim();
      const id = ++seq.current;
      if (t.length < MIN_QUERY_CHARS) {
        clear();
        return [];
      }
      const m = await ensure();
      if (id !== seq.current) return null;
      const { items: results, problem } = await m.getSearchClient().suggest(t);
      if (id !== seq.current) return null;
      if (problem) {
        // A wildcard pattern the engine refuses (only symbols, too many): say why instead of "no results".
        clear();
        showNotice(problem);
        return [];
      }
      if (isWildcardQuery(t) && results.length > 0 && trackedPattern.current !== t) {
        trackedPattern.current = t;
        track({ name: 'wildcard_search_used' }); // the pattern itself is never sent
      }
      show(results, t, preselectStrong);
      return results;
    },
    [clear, show, ensure, showNotice],
  );

  // Track the current query (any source) and the "re-run when the index becomes ready" callback.
  useEffect(() => {
    termRef.current = term;
  }, [term]);
  useEffect(() => {
    reRun.current = () => {
      if (focused && termRef.current.length >= MIN_QUERY_CHARS) void runSearch(termRef.current);
    };
  }, [focused, runSearch]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value);
    void runSearch(e.target.value);
  }

  function go(index: number) {
    setOpen(false);
    if (index < items.length) {
      track({ name: 'search_used', params: { method: 'suggestion_clicked' } });
      router.push(routes.drug(items[index].slug));
    } else {
      track({ name: 'search_used', params: { method: 'full_search' } });
      router.push(routes.search(term));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && optionCount) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % optionCount);
    } else if (e.key === 'ArrowUp' && optionCount) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? optionCount - 1 : i - 1));
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      go(active);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (q) {
        e.preventDefault();
        setQ('');
        clear();
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  function onFocus() {
    warm();
    setFocused(true);
    if (items.length > 0) setOpen(true);
    // The wildcard hint, on the first few focuses in this browser only.
    const shows = hintShows();
    if (shows < WILDCARD_HINT_SHOWS) {
      setHint(true);
      countHintShow(shows);
    }
    // On phones, bring the input just under the top so the suggestions have room above the keyboard.
    if (isMobile()) {
      requestAnimationFrame(() => {
        const top = (boxRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 8;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
    }
  }

  async function onVoice(e: VoiceEvent) {
    if (e.type === 'interim') {
      const value = e.text.slice(0, MAX_LENGTH);
      setQ(value);
      void runSearch(value);
    } else if (e.type === 'final') {
      track({ name: 'voice_search_used' });
      // Names are often spoken in English or transliterated: take the first transcript
      // (the best one, then the recogniser's alternatives) that has suggestions.
      const candidates = [e.text, ...e.alternatives].map((t) => t.slice(0, MAX_LENGTH)).filter(Boolean);
      for (const [i, candidate] of candidates.entries()) {
        setQ(candidate);
        const results = await runSearch(candidate, true);
        if (results === null) return; // the user typed meanwhile
        if (results.length > 0 || i === candidates.length - 1) return;
      }
    } else if (e.type === 'error') {
      showNotice(VOICE_MESSAGES[e.code]);
    }
  }

  const warm = () => void ensure().then((m) => m.getSearchClient().warm());
  const option = (selected: boolean) =>
    cx('flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2', selected ? 'bg-primary-tint' : 'hover:bg-surface');

  return (
    <form role="search" action="/search" method="get" className="relative w-full" onSubmit={() => setOpen(false)}>
      <label htmlFor={inputId} className="sr-only">
        ابحث عن دواء بالاسم التجاري أو المادة الفعالة
      </label>
      <div
        ref={boxRef}
        onPointerEnter={warm}
        onTouchStart={warm}
        className={cx(
          'flex items-center gap-1 rounded-control border border-border bg-bg ps-3 pe-1 transition-colors',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-tint',
          size === 'lg' ? 'min-h-14' : 'min-h-11',
        )}
      >
        <SearchIcon className="me-1 shrink-0 text-muted" />
        <input
          id={inputId}
          name="q"
          type="search"
          value={q}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() =>
            setTimeout(() => {
              setOpen(false);
              setFocused(false);
              setHint(false);
              setListMaxH(null);
            }, 120)
          }
          onFocus={onFocus}
          placeholder={listening ? LISTENING_PLACEHOLDER : PLACEHOLDER}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          enterKeyHint="search"
          maxLength={MAX_LENGTH}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          className="min-h-11 min-w-0 flex-1 self-stretch bg-transparent py-2 text-base text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={() => setHelp((v) => !v)}
          aria-label="طريقة البحث بالنجمة"
          aria-haspopup="dialog"
          aria-expanded={help}
          aria-controls={help ? helpId : undefined}
          title="مش قاري الاسم كله؟"
          className="tap grid size-9 shrink-0 place-items-center rounded-full text-lg font-semibold leading-none text-muted hover:bg-surface hover:text-primary"
        >
          ؟
        </button>
        <VoiceButton onEvent={onVoice} onListeningChange={setListening} size={size} />
        <button type="submit" className="tap shrink-0 rounded-control-sm bg-primary px-3 font-medium text-on-primary hover:bg-primary-hover">
          بحث
        </button>
      </div>
      {help && <WildcardHelp id={helpId} onClose={() => setHelp(false)} />}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {notice ? (
        <p role="alert" className="type-small mt-1.5 text-up">
          {notice}
        </p>
      ) : (
        hint && (
          <p className="type-small mt-1.5 text-text-2">
            {WILDCARD_HINT}
          </p>
        )
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="اقتراحات البحث"
        hidden={!open}
        style={listMaxH !== null ? { maxHeight: `${listMaxH}px` } : undefined}
        className="absolute inset-x-0 top-full z-40 mt-1 max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain rounded-card border border-border bg-bg py-1 shadow-lg"
      >
        {items.map((item, i) => (
          <li
            key={item.slug}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              go(i);
            }}
            onMouseEnter={() => setActive(i)}
            className={option(i === active)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">
                <Highlight text={item.ar} query={shownFor} highlight={highlight} />
              </span>
              <span className="type-small block truncate text-text-2">
                {item.en !== item.ar && (
                  <span dir="ltr" lang="en">
                    <Highlight text={tradeName(item.en)} query={shownFor} highlight={highlight} />
                  </span>
                )}
                {item.form && (
                  <>
                    {item.en !== item.ar && <span aria-hidden="true"> • </span>}
                    {item.form}
                  </>
                )}
                {item.ingredient && (
                  <>
                    <span aria-hidden="true"> • </span>
                    <span className="text-muted">المادة الفعالة: {item.ingredient}</span>
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
        {items.length > 0 && (
          <li
            id={`${listId}-${items.length}`}
            role="option"
            aria-selected={active === items.length}
            onMouseDown={(e) => {
              e.preventDefault();
              go(items.length);
            }}
            onMouseEnter={() => setActive(items.length)}
            className={cx(option(active === items.length), 'border-t border-border font-medium text-primary')}
          >
            <span className="flex items-center gap-2">
              <SearchIcon size={16} />
              كل النتائج عن «{term}»
            </span>
          </li>
        )}
      </ul>
    </form>
  );
}
