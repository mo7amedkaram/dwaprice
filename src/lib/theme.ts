// Theme (light / dark / follow the device). Shared by the <head> script in the root layout,
// the ThemeToggle component and the tokens in src/styles/tokens.css.
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ThemeValue = 'light' | 'dark';

/** localStorage key; absent means "system". */
export const THEME_KEY = 'dw_theme';
export const THEME_ATTR = 'data-theme';
export const THEME_CHOICE_ATTR = 'data-theme-choice';
/** Page background per theme: the browser UI colour (<meta name="theme-color">). */
export const THEME_COLORS = { light: '#FFFFFF', dark: '#0F172A' } as const;

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'system' || v === 'light' || v === 'dark';

/**
 * Runs inline in <head> before anything is painted, so the first frame already has the right
 * theme. Kept tiny and self-contained (ES5, try/catch: localStorage can throw in private mode).
 * data-theme = the effective theme; data-theme-choice = what the visitor picked.
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var m=c==='dark'||c==='light'?c:'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var h=document.documentElement;h.setAttribute('${THEME_ATTR}',d?'dark':'light');h.setAttribute('${THEME_CHOICE_ATTR}',m);}catch(e){}})();`;
