import { compareDesc } from 'date-fns';

import { toNumber } from './utils';

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

export function compareSecurityBalanceRecency(
	a: SecurityBalanceValueInput,
	b: SecurityBalanceValueInput
) {
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

		if (toNumber(latest.quantity) === 0) {
			resolved.set(key, { balance: latest, value: 0, costBasis: 0 });
			continue;
		}

		let value = toNumber(latest.value);
		if (value === null) {
			for (const balance of sorted) {
				if (toNumber(balance.quantity) === 0) {
					value = 0;
					break;
				}
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
				if (toNumber(balance.quantity) === 0) {
					costBasis = 0;
					break;
				}
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
