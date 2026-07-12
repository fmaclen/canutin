import { compareDesc } from 'date-fns';

import { getFormattingLocale } from '$lib/interface-preferences.svelte';

import { toNumber } from './utils';

export function formatSecurityQuantity(value: number) {
	return new Intl.NumberFormat(getFormattingLocale(), { maximumFractionDigits: 8 }).format(value);
}

export type SecurityBalanceValueInput = {
	id: string;
	account: string;
	security: string;
	asOf: string;
	created: string;
	quantity: number | null;
	price: number | null;
	value: number | null;
	costBasis: number | null;
};

export type SecurityBalanceResolvedValue = {
	balance: SecurityBalanceValueInput;
	value: number | null;
	costBasis: number | null;
};

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

function compareSecurityBalanceRecency(a: SecurityBalanceValueInput, b: SecurityBalanceValueInput) {
	const asOfCompare = compareDesc(new Date(a.asOf), new Date(b.asOf));
	if (asOfCompare !== 0) return asOfCompare;
	const createdCompare = compareDesc(new Date(a.created), new Date(b.created));
	if (createdCompare !== 0) return createdCompare;
	return b.id.localeCompare(a.id);
}

export function resolveSecurityBalanceValues(balances: SecurityBalanceValueInput[]) {
	const byPair = new Map<string, SecurityBalanceValueInput[]>();
	for (const balance of balances) {
		const key = `${balance.account}:${balance.security}`;
		const pairBalances = byPair.get(key);
		if (pairBalances) pairBalances.push(balance);
		else byPair.set(key, [balance]);
	}

	const resolved = new Map<string, SecurityBalanceResolvedValue>();
	for (const [key, pairBalances] of byPair) {
		const sorted = pairBalances.toSorted(compareSecurityBalanceRecency);
		const latest = sorted[0];
		if (!latest) continue;

		// NOTE: securityBalances stores quantity/price/value/costBasis as JSON, where `null`
		// means UNKNOWN (no recorded value) - distinct from a known `0`. This differs from
		// assetBalances, which uses native number fields and has no unknown state. This resolver
		// must therefore preserve `null` as unknown and never coerce it to `0`.
		if (toNumber(latest.quantity) === 0) {
			resolved.set(key, { balance: latest, value: 0, costBasis: 0 });
			continue;
		}

		// The latest holding has quantity > 0 but possibly no recorded value. Carry forward the
		// most recent known value, but stop at a sold-out (quantity 0) balance: its `0` belongs to
		// the prior lot, so a re-bought holding with no fresh value is genuinely UNKNOWN, not 0.
		let value = toNumber(latest.value);
		if (value === null) {
			for (const balance of sorted) {
				if (toNumber(balance.quantity) === 0) break;
				const known = toNumber(balance.value);
				if (known !== null) {
					value = known;
					break;
				}
			}
		}

		let costBasis = toNumber(latest.costBasis);
		if (costBasis === null) {
			for (const balance of sorted) {
				if (toNumber(balance.quantity) === 0) break;
				const known = toNumber(balance.costBasis);
				if (known !== null) {
					costBasis = known;
					break;
				}
			}
		}

		resolved.set(key, { balance: latest, value, costBasis });
	}

	return resolved;
}
