'use client';

// Search field with suggestions (WAI-ARIA 1.2 combobox + listbox). Submitting
// goes to /search?q=; suggestions come from the public endpoint /api/search,
// the only database access reachable from the browser.
// - debounced (200 ms), previous request aborted, answers cached per query;
// - keyboard: ↓/↑ move (wrapping), Enter opens the active option (or submits),
//   Escape closes then clears, Tab leaves; the last option is "all results";
// - no layout shift: the list is absolutely positioned over the content and the
//   result count is announced through a visually hidden live region.
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchIcon } from './icons';
import { CURRENCY_AR, formatAmount, tradeName } from '@/lib/format';
import { routes } from '@/lib/site';
import { cx } from './ui';

interface Suggestion {
  slug: string;
  name_ar: string | null;
  name_en: string;
  strength: string | null;
  current_price: string | null;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

export function SearchBox({ id, size = 'md', autoFocus = false }: { id?: string; size?: 'md' | 'lg'; autoFocus?: boolean }) {
  const reactId = useId();
  const inputId = id ?? `search-${reactId}`;
  const listId = `${inputId}-list`;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const abort = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, Suggestion[]>());

  const term = q.trim();
  // Options: the suggestions, then "all results for …".
  const optionCount = items.length > 0 ? items.length + 1 : 0;

  useEffect(() => {
    abort.current?.abort();
    if (term.length < MIN_CHARS) return; // list cleared in onChange
    const show = (results: Suggestion[]) => {
      setItems(results);
      setOpen(results.length > 0);
      setActive(-1);
      setStatus(results.length > 0 ? `${results.length} اقتراحات متاحة، استخدم الأسهم للتنقل` : 'لا توجد اقتراحات');
    };
    const cached = cache.current.get(term);
    if (cached) {
      show(cached);
      return;
    }
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { results: Suggestion[] };
        cache.current.set(term, data.results);
        if (!controller.signal.aborted) show(data.results);
      } catch {
        /* aborted or offline: keep the field usable */
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

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
        setItems([]);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const option = (selected: boolean) =>
    cx('flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2', selected ? 'bg-primary-tint' : 'hover:bg-surface');

  return (
    <form role="search" action="/search" method="get" className="relative w-full" onSubmit={() => setOpen(false)}>
      <label htmlFor={inputId} className="sr-only">
        ابحث عن دواء بالاسم التجاري أو المادة الفعالة
      </label>
      <div
        className={cx(
          'flex items-center gap-2 rounded-control border border-border bg-bg ps-3 pe-1 transition-colors',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-tint',
          size === 'lg' ? 'min-h-14' : 'min-h-11',
        )}
      >
        <SearchIcon className="shrink-0 text-muted" />
        <input
          id={inputId}
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < MIN_CHARS) {
              setItems([]);
              setOpen(false);
              setStatus('');
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="ابحث باسم الدواء أو المادة الفعالة"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          enterKeyHint="search"
          maxLength={80}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          className="min-h-11 min-w-0 flex-1 self-stretch bg-transparent py-2 text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <button type="submit" className="tap shrink-0 rounded-control-sm bg-primary px-3 font-medium text-on-primary hover:bg-primary-hover">
          بحث
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
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
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{item.name_ar ?? tradeName(item.name_en)}</span>
              <span className="type-small block truncate text-text-2">
                <span dir="ltr" lang="en">
                  {tradeName(item.name_en)}
                </span>
              </span>
            </span>
            {formatAmount(item.current_price) && (
              <span className="price shrink-0 font-medium text-ink">
                {formatAmount(item.current_price)} <span className="type-small font-normal text-text-2">{CURRENCY_AR}</span>
              </span>
            )}
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
