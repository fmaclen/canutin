export type CurrencyFormatOptions = {
	currency?: string;
	locale?: string;
	maximumFractionDigits?: number;
};

export function formatCurrency(value: number | null | undefined, options?: CurrencyFormatOptions) {
	const { currency = 'USD', locale = 'en-US', maximumFractionDigits = 0 } = options ?? {};
	return new Intl.NumberFormat(locale, {
		currency,
		style: 'currency',
		maximumFractionDigits
	}).format(value ?? 0);
}

