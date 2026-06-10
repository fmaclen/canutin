import { endOfDay, startOfDay, startOfYear, subMonths, subYears } from 'date-fns';

import type {
	AccountBalancesResponse,
	AccountsResponse,
	AssetBalancesResponse,
	AssetsResponse,
	SecurityBalancesResponse
} from '$lib/pocketbase.schema';
import { toNumber } from '$lib/utils';

export type PeriodKey = '3m' | '6m' | 'ytd' | '1y' | '2y' | '5y' | 'max';
export type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
export type TrendSecurityBalance = Pick<
	SecurityBalancesResponse<number, number, number, number>,
	'id' | 'account' | 'security' | 'value' | 'quantity' | 'asOf'
>;

export type TrendAccount = AccountsResponse & { closed?: string };
export type TrendAsset = AssetsResponse & { sold?: string };
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
	const cutoffDate = endOfDay(targetDate);
	let index = startIndex;
	while (index + 1 < entries.length && new Date(entries[index + 1].asOf) <= cutoffDate) index++;
	return index;
}

export function findEarliestBalanceDate(
	rawAccountBalances: AccountBalancesResponse[],
	rawSecurityBalances: TrendSecurityBalance[],
	rawAssetBalances: AssetBalancesResponse[]
) {
	let earliest: Date | null = null;
	for (const b of rawAccountBalances) {
		const d = new Date(b.asOf);
		if (!earliest || d < earliest) earliest = d;
	}
	for (const b of rawSecurityBalances) {
		const d = new Date(b.asOf);
		if (!earliest || d < earliest) earliest = d;
	}
	for (const b of rawAssetBalances) {
		const d = new Date(b.asOf);
		if (!earliest || d < earliest) earliest = d;
	}
	return earliest;
}

export function computeRangeForPeriod(
	period: PeriodKey,
	rawAccountBalances: AccountBalancesResponse[],
	rawSecurityBalances: TrendSecurityBalance[],
	rawAssetBalances: AssetBalancesResponse[]
) {
	const now = startOfDay(new Date());
	if (period === '3m') return { start: subMonths(now, 3), end: now };
	if (period === '6m') return { start: subMonths(now, 6), end: now };
	if (period === 'ytd') return { start: startOfYear(now), end: now };
	if (period === '1y') return { start: subYears(now, 1), end: now };
	if (period === '2y') return { start: subYears(now, 2), end: now };
	if (period === '5y') return { start: subYears(now, 5), end: now };

	const earliest = findEarliestBalanceDate(
		rawAccountBalances,
		rawSecurityBalances,
		rawAssetBalances
	);
	const start = earliest ? startOfDay(earliest) : subYears(now, 1);
	return { start, end: now };
}

export function buildPreparedMaps(
	accounts: TrendAccount[],
	assets: TrendAsset[],
	accountBalances: AccountBalancesResponse[],
	securityBalances: TrendSecurityBalance[],
	assetBalances: AssetBalancesResponse[]
) {
	const accountBalancesByAccountId = new Map<string, AccountBalancesResponse[]>();
	for (const balance of accountBalances) {
		const existing = accountBalancesByAccountId.get(balance.account) || [];
		existing.push(balance);
		accountBalancesByAccountId.set(balance.account, existing);
	}
	const securityBalancesByAccountSecurity = new Map<string, TrendSecurityBalance[]>();
	for (const balance of securityBalances) {
		const key = `${balance.account}:${balance.security}`;
		const existing = securityBalancesByAccountSecurity.get(key) || [];
		existing.push(balance);
		securityBalancesByAccountSecurity.set(key, existing);
	}
	const assetBalancesByAssetId = new Map<string, AssetBalancesResponse[]>();
	for (const balance of assetBalances) {
		if (!assets.find((a) => a.id === balance.asset)) continue;
		const existing = assetBalancesByAssetId.get(balance.asset) || [];
		existing.push(balance);
		assetBalancesByAssetId.set(balance.asset, existing);
	}
	return {
		accountBalancesByAccountId,
		securityBalancesByAccountSecurity,
		assetBalancesByAssetId,
		accountById: new Map(accounts.map((a) => [a.id, a] as const)),
		assetById: new Map(assets.map((a) => [a.id, a] as const))
	};
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
