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
import { routes } from '@/lib/site';
import { cx } from './ui';
import { MAX_QUERY_CHARS, MIN_QUERY_CHARS, PRESELECT_MAX_TIER } from '@/lib/search/constants';
import type { Suggestion } from '@/lib/search/index-format';
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
type HighlightFn = (text: string, query: string) => boolean[];

/** The display string with the words the query matches wrapped in <mark>. */
function Highlight({ text, query, highlight }: { text: string; query: string; highlight: HighlightFn | null }) {
  if (!highlight) return <>{text}</>;
  const parts = text.split(/(\s+)/); // words at even positions, the separators between them
  const flags = highlight(text, query);
  let word = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) return part;
        const hit = flags[word++];
        return hit ? (
          <mark key={i} className="rounded-sm bg-primary-tint text-inherit">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
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

  const term = q.trim();
  // Options: the suggestions, then "all results for …".
  const optionCount = items.length > 0 ? items.length + 1 : 0;

  // Load the suggestion engine + client (one shared chunk) on first need; cache it in the ref.
  const ensure = useCallback(async (): Promise<SuggestModule> => {
    if (!mod.current) {
      mod.current = await loadSuggest();
      setHighlight(() => mod.current!.matchedWords);
    }
    return mod.current;
  }, []);

  useEffect(() => {
    // Idle prefetch (home/search) happens after hydration, so the chunk is not on the first load.
    if (prefetch) void ensure().then((m) => m.getSearchClient().prefetchWhenIdle());
  }, [prefetch, ensure]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const clear = useCallback(() => {
    seq.current++;
    setItems([]);
    setOpen(false);
    setActive(-1);
    setStatus('');
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
      const { items: results } = await m.getSearchClient().suggest(t);
      if (id !== seq.current) return null;
      show(results, t, preselectStrong);
      return results;
    },
    [clear, show, ensure],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value);
    void runSearch(e.target.value);
  }

  function go(index: number) {
    setOpen(false);
    if (index < items.length) router.push(routes.drug(items[index].slug));
    else router.push(routes.search(term));
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

  function showNotice(message: string) {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
  }

  async function onVoice(e: VoiceEvent) {
    if (e.type === 'interim') {
      const value = e.text.slice(0, MAX_LENGTH);
      setQ(value);
      void runSearch(value);
    } else if (e.type === 'final') {
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
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onFocus={() => {
            warm();
            if (items.length > 0) setOpen(true);
          }}
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
          className="min-h-11 min-w-0 flex-1 self-stretch bg-transparent py-2 text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <VoiceButton onEvent={onVoice} onListeningChange={setListening} size={size} />
        <button type="submit" className="tap shrink-0 rounded-control-sm bg-primary px-3 font-medium text-on-primary hover:bg-primary-hover">
          بحث
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {notice && (
        <p role="alert" className="type-small mt-1.5 text-up">
          {notice}
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="اقتراحات البحث"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 mt-1 max-h-[min(28rem,70vh)] overflow-y-auto rounded-card border border-border bg-bg py-1 shadow-lg"
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
