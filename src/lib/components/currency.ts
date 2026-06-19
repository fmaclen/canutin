import { formatValue } from '@canutin/svelte-currency-input';

import { getFormattingLocale } from '$lib/interface-preferences.svelte';

export function getIntlConfig(currency = 'USD') {
	return { locale: getFormattingLocale(), currency };
}

export function formatCurrency(
	value: number | null | undefined,
	decimalScale = 0,
	currency = 'USD'
) {
	return formatValue({
		value: String(value ?? 0),
		intlConfig: getIntlConfig(currency),
		decimalScale,
		roundValue: true
	});
}
