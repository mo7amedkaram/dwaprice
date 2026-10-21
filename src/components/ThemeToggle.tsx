'use client';

// Theme switch: "group" is three pressed-state buttons (device / light / dark), "cycle" is one
// button that steps through them (for narrow headers). All instances share one store: the
// attributes on <html> that the head script (src/lib/theme.ts) set before the first paint.
import { useEffect, useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon, ThemeAutoIcon } from './icons';
import { cx } from './ui';
import { THEME_ATTR, THEME_CHOICE_ATTR, THEME_COLORS, THEME_KEY, isThemeChoice, type ThemeChoice } from '@/lib/theme';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const ICONS = { system: ThemeAutoIcon, light: SunIcon, dark: MoonIcon } as const;
const TEXT = {
  ar: { group: 'المظهر', system: 'حسب الجهاز', light: 'فاتح', dark: 'داكن', current: 'المظهر الحالي', cycle: 'اضغط للتبديل' },
  en: { group: 'Appearance', system: 'Follow device', light: 'Light', dark: 'Dark', current: 'Current appearance', cycle: 'press to switch' },
} as const;

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const readChoice = (): ThemeChoice => {
  const v = document.documentElement.getAttribute(THEME_CHOICE_ATTR);
  return isThemeChoice(v) ? v : 'system';
};
const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Writes the effective theme to <html> (and the browser UI colour) and notifies every toggle. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && prefersDark());
  const html = document.documentElement;
  html.setAttribute(THEME_ATTR, dark ? 'dark' : 'light');
  html.setAttribute(THEME_CHOICE_ATTR, choice);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // a manual choice overrides the media-matched colour; "system" lets the media attribute decide again
    if (choice === 'system') {
      meta.setAttribute('media', meta.content === THEME_COLORS.dark ? '(prefers-color-scheme: dark)' : '(prefers-color-scheme: light)');
    } else {
      meta.removeAttribute('media');
      meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light;
    }
  }
  listeners.forEach((l) => l());
}

function setChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // private mode: the choice still applies to this page
  }
  applyTheme(choice);
}

function useThemeChoice(): ThemeChoice {
  // the server renders "system"; after hydration the attribute the head script set wins
  const choice = useSyncExternalStore(subscribe, readChoice, (): ThemeChoice => 'system');
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => readChoice() === 'system' && applyTheme('system');
    const onStorage = (e: StorageEvent) => e.key === THEME_KEY && applyTheme(isThemeChoice(e.newValue) ? e.newValue : 'system');
    mq.addEventListener('change', onMedia);
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onMedia);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return choice;
}

const button = 'tap inline-flex items-center justify-center rounded-control-sm transition-colors';

export function ThemeToggle({ variant = 'group', lang = 'ar', className }: { variant?: 'group' | 'cycle'; lang?: 'ar' | 'en'; className?: string }) {
  const choice = useThemeChoice();
  const t = TEXT[lang];
  if (variant === 'cycle') {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    const Icon = ICONS[choice];
    return (
      <button
        type="button"
        onClick={() => setChoice(next)}
        aria-label={`${t.current}: ${t[choice]}. ${t.cycle}: ${t[next]}`}
        title={`${t.group}: ${t[choice]}`}
        className={cx(button, 'border border-border text-text-2 hover:border-primary hover:text-primary', className)}
      >
        <Icon />
      </button>
    );
  }
  return (
    <div role="group" aria-label={t.group} className={cx('inline-flex rounded-control border border-border bg-bg p-0.5', className)}>
      {ORDER.map((c) => {
        const Icon = ICONS[c];
        const pressed = c === choice;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setChoice(c)}
            aria-pressed={pressed}
            aria-label={t[c]}
            title={t[c]}
            className={cx(button, pressed ? 'bg-primary-tint text-primary' : 'text-text-2 hover:text-primary')}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
