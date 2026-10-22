// Language of the drug-information section only (عربي | English). The rest of the site stays
// Arabic. Shared by the <head> script in the root layout, the InfoLangToggle component and the
// CSS in globals.css that shows .info-ar or .info-en based on html[data-info-lang].
export type InfoLang = 'ar' | 'en';

/** localStorage key; absent means Arabic. */
export const INFO_LANG_KEY = 'dw_info_lang';
export const INFO_LANG_ATTR = 'data-info-lang';

export const isInfoLang = (v: unknown): v is InfoLang => v === 'ar' || v === 'en';

/**
 * Runs inline in <head> before paint, so a reader who chose English sees it on every drug page
 * with no flash and no layout shift. ES5, try/catch (localStorage can throw in private mode).
 */
export const INFO_LANG_SCRIPT = `(function(){try{var v=localStorage.getItem('${INFO_LANG_KEY}');document.documentElement.setAttribute('${INFO_LANG_ATTR}',v==='en'?'en':'ar');}catch(e){}})();`;
