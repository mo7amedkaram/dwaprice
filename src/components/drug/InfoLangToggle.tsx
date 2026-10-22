'use client';

// "عربي | English" switch for the drug-information section only. It sets html[data-info-lang],
// which CSS uses to show the Arabic or the English container (both are already in the HTML, so
// the switch is instant and causes no layout shift or request). The choice is saved in
// localStorage and applied before paint by the <head> script (lib/info-lang.ts), so it carries to
// later drug pages. All instances share the attribute via useSyncExternalStore.
import { useCallback, useSyncExternalStore } from 'react';
import { INFO_LANG_ATTR, INFO_LANG_KEY, isInfoLang, type InfoLang } from '@/lib/info-lang';
import { track } from '@/lib/analytics';

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

function current(): InfoLang {
  if (typeof document === 'undefined') return 'ar';
  return document.documentElement.getAttribute(INFO_LANG_ATTR) === 'en' ? 'en' : 'ar';
}

function set(lang: InfoLang) {
  document.documentElement.setAttribute(INFO_LANG_ATTR, lang);
  try {
    if (lang === 'ar') localStorage.removeItem(INFO_LANG_KEY);
    else localStorage.setItem(INFO_LANG_KEY, lang);
  } catch {
    /* private mode: the attribute still applies for this page */
  }
  track({ name: 'toggle_info_language', params: { lang } });
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === INFO_LANG_KEY) {
      document.documentElement.setAttribute(INFO_LANG_ATTR, isInfoLang(e.newValue) ? e.newValue : 'ar');
      notify();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function InfoLangToggle({ className }: { className?: string }) {
  const lang = useSyncExternalStore(subscribe, current, (): InfoLang => 'ar');
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      set(current() === 'ar' ? 'en' : 'ar');
    }
  }, []);

  const btn = (value: InfoLang, label: string) => {
    const active = lang === value;
    return (
      <button
        type="button"
        onClick={() => set(value)}
        onKeyDown={onKeyDown}
        aria-pressed={active}
        lang={value === 'en' ? 'en' : undefined}
        className={
          'tap inline-flex min-h-9 items-center rounded-control-sm px-3 text-sm font-medium transition-colors ' +
          (active ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-surface hover:text-primary')
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div role="group" aria-label="لغة معلومات الدواء / drug information language" className={'inline-flex rounded-control border border-border bg-bg p-0.5 ' + (className ?? '')}>
      {btn('ar', 'عربي')}
      {btn('en', 'English')}
    </div>
  );
}
