import { formatValue } from '@canutin/svelte-currency-input';

import {
	getCurrencyLocale,
	getFormattingLocale,
	interfacePreferences
} from '$lib/interface-preferences.svelte';

// NOTE: Intl.NumberFormat's currency style only accepts well-formed 3-ASCII-letter codes; free-form
// codes (crypto tickers, custom codes) throw a RangeError. Callers gate on this and fall back to a
// plain decimal with the code appended (e.g. "1,234.56 USDT") so formatting can never throw.
export function isIntlCurrency(currency: string) {
	return /^[A-Za-z]{3}$/.test(currency);
}

function formatInLocale(
	value: number | null | undefined,
	decimalScale: number,
	currency: string,
	locale: string
) {
	if (isIntlCurrency(currency)) {
		return formatValue({
			value: String(value ?? 0),
			intlConfig: { locale, currency },
			decimalScale,
			roundValue: true
		});
	}

	const amount = formatValue({
		value: String(value ?? 0),
		intlConfig: { locale, style: 'decimal' },
		decimalScale,
		roundValue: true
	});
	return `${amount} ${currency}`;
}

export function formatCurrency(
	value: number | null | undefined,
	decimalScale = 0,
	currency: string = interfacePreferences.displayCurrency
) {
	return formatInLocale(value, decimalScale, currency, getFormattingLocale());
}

export function formatNativeCurrency(
	value: number | null | undefined,
	decimalScale: number,
	currency: string
) {
	return formatInLocale(value, decimalScale, currency, getCurrencyLocale(currency));
}
