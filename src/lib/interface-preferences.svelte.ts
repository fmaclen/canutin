import { cookieName, getLocale, localStorageKey, setLocale } from '$lib/paraglide/runtime';

export const interfaceLocales = ['en', 'es'] as const;

export type InterfaceLocale = (typeof interfaceLocales)[number];
export type InterfaceThemeMode = 'system' | 'light' | 'dark';

export const interfacePreferences = $state({
	locale: 'en' as InterfaceLocale,
	formatLocale: 'en-US'
});

export function getFormattingLocale() {
	return interfacePreferences.formatLocale;
}

function isInterfaceLocale(value: string | null | undefined): value is InterfaceLocale {
	return value === 'en' || value === 'es';
}

function readCookieLocale() {
	if (typeof document === 'undefined') {
		return null;
	}

	const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]+)`));
	return match ? decodeURIComponent(match[1]) : null;
}

function readPersistedLocale() {
	if (typeof window === 'undefined') {
		return null;
	}

	const storedLocale = window.localStorage.getItem(localStorageKey);
	if (isInterfaceLocale(storedLocale)) {
		return storedLocale;
	}

	const cookieLocale = readCookieLocale();
	if (isInterfaceLocale(cookieLocale)) {
		return cookieLocale;
	}

	return null;
}

function getBrowserLocale() {
	if (typeof navigator === 'undefined') {
		return null;
	}

	for (const locale of [...navigator.languages, navigator.language]) {
		const normalizedLocale = locale?.toLowerCase().split('-')[0];
		if (isInterfaceLocale(normalizedLocale)) {
			return normalizedLocale;
		}
	}

	return null;
}

export async function setInterfaceLocale(locale: InterfaceLocale) {
	await setLocale(locale, { reload: false });
	interfacePreferences.locale = locale;
}

export async function initializeLocale() {
	interfacePreferences.formatLocale = navigator.language || 'en-US';

	const persistedLocale = readPersistedLocale();

	if (persistedLocale) {
		const currentLocale = getLocale();

		if (persistedLocale !== currentLocale) {
			await setInterfaceLocale(persistedLocale);
		} else {
			interfacePreferences.locale = persistedLocale;
		}

		return persistedLocale;
	}

	const browserLocale = getBrowserLocale();
	if (browserLocale) {
		await setInterfaceLocale(browserLocale);
		return browserLocale;
	}

	await setInterfaceLocale('en');
	return 'en';
}
