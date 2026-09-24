import { getFormattingLocale } from '$lib/interface-preferences.svelte';

export function formatSecurityQuantity(value: number) {
	return new Intl.NumberFormat(getFormattingLocale(), { maximumFractionDigits: 8 }).format(value);
}

export function sumOrUnknown(values: Array<number | null>): number | null {
	let sum = 0;
	for (const value of values) {
		if (value === null) return null;
		sum += value;
	}
	return sum;
}

export function compareByValueDescThenName<T>(
	getValue: (item: T) => number | null,
	getName: (item: T) => string
) {
	return (a: T, b: T) => {
		const aValue = getValue(a);
		const bValue = getValue(b);
		if (aValue === null && bValue === null)
			return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' });
		if (aValue === null) return 1;
		if (bValue === null) return -1;
		if (bValue !== aValue) return bValue - aValue;
		return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' });
	};
}

export function gainLossPercentOrNull(
	gainLoss: number | null,
	costBasis: number | null
): number | null {
	if (gainLoss === null || costBasis === null || costBasis === 0) return null;
	return (gainLoss / costBasis) * 100;
}

export function sentiment(value: number | null) {
	if (value === null || value === 0) return 'neutral';
	return value > 0 ? 'positive' : 'negative';
}
