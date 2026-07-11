import { cookieName, getLocale, localStorageKey, setLocale } from '$lib/paraglide/runtime';

export type InterfaceLocale = 'en' | 'es';
export type InterfaceThemeMode = 'system' | 'light' | 'dark';
export type DisplayCurrencyRegistry = {
	isLoaded: boolean;
	hasCurrency(currency: string): boolean;
};

// NOTE: representative home locale per curated currency, so native amounts (the FX tooltip and the
// no-rate rendering) format the way that currency is actually written - pesos "$ 1.000.000,00"
// rather than the viewer-locale "ARS 1,000,000.00". Partial by design: codes outside the curated
// list resolve to the viewer locale via getCurrencyLocale.
export const CURRENCY_LOCALES: Partial<Record<string, string>> = {
	USD: 'en-US',
	EUR: 'de-DE',
	ARS: 'es-AR',
	GBP: 'en-GB',
	JPY: 'ja-JP',
	CAD: 'en-CA',
	AUD: 'en-AU',
	CHF: 'de-CH',
	CNY: 'zh-CN',
	BRL: 'pt-BR',
	MXN: 'es-MX',
	INR: 'en-IN',
	NZD: 'en-NZ',
	SEK: 'sv-SE',
	NOK: 'nb-NO',
	DKK: 'da-DK',
	PLN: 'pl-PL',
	KRW: 'ko-KR',
	SGD: 'en-SG',
	ZAR: 'en-ZA'
};

const displayCurrencyStorageKey = 'canutin-display-currency';

type InterfacePreferences = {
	locale: InterfaceLocale;
	formatLocale: string;
	preferredDisplayCurrency: string;
	displayCurrency: string;
};

let displayCurrencyRegistry: DisplayCurrencyRegistry | null = null;

export const interfacePreferences: InterfacePreferences = $state({
	locale: 'en',
	formatLocale: 'en-US',
	preferredDisplayCurrency: 'USD',
	displayCurrency: 'USD'
});

export function getFormattingLocale() {
	return interfacePreferences.formatLocale;
}

export function getCurrencyLocale(currency: string) {
	return CURRENCY_LOCALES[currency] ?? getFormattingLocale();
}

function isInterfaceLocale(value: string | null | undefined): value is InterfaceLocale {
	return value === 'en' || value === 'es';
}

// NOTE: currency codes are free-form - any uppercase alphanumeric 2-10 chars (ISO 4217, crypto
// tickers like BTC/USDT, custom codes). This is the single frontend source of the rule; the same
// pattern (^[A-Z0-9]{2,10}$) is enforced in the PocketBase schema, Go import validation and hooks.
function isValidCurrencyCode(value: string | null | undefined): value is string {
	return typeof value === 'string' && /^[A-Z0-9]{2,10}$/.test(value);
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

export function setDisplayCurrency(currency: string) {
	if (!isValidCurrencyCode(currency)) return;
	interfacePreferences.preferredDisplayCurrency = currency;
	interfacePreferences.displayCurrency = resolveDisplayCurrency();
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(displayCurrencyStorageKey, currency);
	}
}

export function initializeDisplayCurrency() {
	const stored =
		typeof window === 'undefined' ? null : window.localStorage.getItem(displayCurrencyStorageKey);
	if (isValidCurrencyCode(stored)) {
		interfacePreferences.preferredDisplayCurrency = stored;
	}
	interfacePreferences.displayCurrency = resolveDisplayCurrency();
	return interfacePreferences.displayCurrency;
}

export function connectDisplayCurrencyRegistry(registry: DisplayCurrencyRegistry) {
	$effect(() => {
		displayCurrencyRegistry = registry;
		interfacePreferences.displayCurrency = resolveDisplayCurrency();
		return () => {
			if (displayCurrencyRegistry === registry) displayCurrencyRegistry = null;
		};
	});
}

function resolveDisplayCurrency() {
	const preferredCurrency = interfacePreferences.preferredDisplayCurrency;
	if (preferredCurrency === 'USD') return 'USD';
	if (!displayCurrencyRegistry) return 'USD';
	if (!displayCurrencyRegistry.isLoaded) return preferredCurrency;
	if (displayCurrencyRegistry.hasCurrency(preferredCurrency)) return preferredCurrency;
	return 'USD';
}
