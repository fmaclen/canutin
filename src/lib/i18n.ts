import { setLocale, locales, baseLocale } from '$lib/paraglide/runtime';

export function isSupportedLocale(value: string | undefined | null): value is string {
	return !!value && (locales as readonly string[]).includes(value);
}

export function setAppLocale(locale: string) {
	const next = isSupportedLocale(locale) ? locale : baseLocale;
	setLocale(next, { reload: false });
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('lang', next);
	}
}

// Initialize locale from any source (DB, API, localStorage). Replace the body as needed.
export async function initLocaleFromStorageOrAPI() {
	try {
		// Placeholder: read from localStorage. Replace with your DB/API call.
		const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('userLocale') : null;
		if (isSupportedLocale(stored)) {
			setAppLocale(stored);
			return;
		}
	} catch {}
	// Fallback: keep current runtime-resolved locale (cookie/global/base)
}
