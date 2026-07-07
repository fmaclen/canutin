import { UTCDate } from '@date-fns/utc';
import { endOfDay } from 'date-fns';

import type { SecurityBalancesResponse } from '$lib/pocketbase.schema';
import { toNumber } from '$lib/utils';

export type TrendSecurityBalance = Pick<
	SecurityBalancesResponse<number, number, number, number>,
	'id' | 'account' | 'security' | 'value' | 'quantity' | 'asOf' | 'created'
>;

export type TrendSecurityValueState = {
	index: number;
	lastKnownValue: number | null;
	soldOut: boolean;
};

export function latestIndexBeforeOrEqual<T extends { asOf: string }>(
	entries: T[],
	targetDate: Date,
	startIndex = -1
) {
	const cutoffDate = endOfDay(new UTCDate(targetDate.getTime()));
	let index = startIndex;
	while (index + 1 < entries.length && new Date(entries[index + 1].asOf) <= cutoffDate) index++;
	return index;
}

export function advanceTrendSecurityValue(
	balances: TrendSecurityBalance[],
	targetDate: Date,
	state: TrendSecurityValueState
) {
	const index = latestIndexBeforeOrEqual(balances, targetDate, state.index);
	for (let i = state.index + 1; i <= index; i++) {
		if (toNumber(balances[i].quantity) === 0) {
			state.lastKnownValue = 0;
			state.soldOut = true;
			continue;
		}
		const known = toNumber(balances[i].value);
		if (known !== null) {
			state.lastKnownValue = known;
			state.soldOut = false;
		}
	}
	state.index = index;
	return state.soldOut ? null : state.lastKnownValue;
}
