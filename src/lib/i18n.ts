import { setLocale, locales, baseLocale, type Locale, getLocale } from '$lib/paraglide/runtime';
import { writable } from 'svelte/store';

export const locale = writable<Locale>(getLocale());

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function setAppLocale(locale: string) {
  const next: Locale = isSupportedLocale(locale) ? locale : (baseLocale as Locale);
  setLocale(next, { reload: false });
  locale.set(next);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', next);
  }
}
export async function initLocaleFromStorageOrAPI() {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('userLocale') : null;
    if (isSupportedLocale(stored)) {
      setAppLocale(stored);
      return;
    }
  } catch {}
}
