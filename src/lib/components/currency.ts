import { formatValue } from '@canutin/svelte-currency-input';

export const intlConfig = { locale: 'en-US', currency: 'USD' };

export function formatCurrency(value: number | null | undefined, decimalScale = 0) {
	return formatValue({ value: String(value ?? 0), intlConfig, decimalScale, roundValue: true });
}
