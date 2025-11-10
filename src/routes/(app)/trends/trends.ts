import { endOfDay, startOfDay, startOfYear, subMonths, subYears } from 'date-fns';
import { SvelteMap } from 'svelte/reactivity';

import type {
	AccountBalancesResponse,
	AccountsResponse,
	AssetBalancesResponse,
	AssetsResponse
} from '$lib/pocketbase.schema';

export type PeriodKey = '3m' | '6m' | 'ytd' | '1y' | '5y' | 'max';
export type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

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
	rawAssetBalances: AssetBalancesResponse[]
) {
	let earliest: Date | null = null;
	for (const b of rawAccountBalances) {
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
	rawAssetBalances: AssetBalancesResponse[]
) {
	const now = startOfDay(new Date());
	if (period === '3m') return { start: subMonths(now, 3), end: now };
	if (period === '6m') return { start: subMonths(now, 6), end: now };
	if (period === 'ytd') return { start: startOfYear(now), end: now };
	if (period === '1y') return { start: subYears(now, 1), end: now };
	if (period === '5y') return { start: subYears(now, 5), end: now };

	const earliest = findEarliestBalanceDate(rawAccountBalances, rawAssetBalances);
	const start = earliest ? startOfDay(earliest) : subYears(now, 1);
	return { start, end: now };
}

export function buildPreparedMaps(
	accounts: AccountsResponse[],
	assets: AssetsResponse[],
	accountBalances: AccountBalancesResponse[],
	assetBalances: AssetBalancesResponse[]
) {
	const accountBalancesByAccountId = new SvelteMap<string, AccountBalancesResponse[]>();
	for (const balance of accountBalances) {
		if (!accounts.find((a) => a.id === balance.account)) continue;
		const existing = accountBalancesByAccountId.get(balance.account) || [];
		existing.push(balance);
		accountBalancesByAccountId.set(balance.account, existing);
	}
	const assetBalancesByAssetId = new SvelteMap<string, AssetBalancesResponse[]>();
	for (const balance of assetBalances) {
		if (!assets.find((a) => a.id === balance.asset)) continue;
		const existing = assetBalancesByAssetId.get(balance.asset) || [];
		existing.push(balance);
		assetBalancesByAssetId.set(balance.asset, existing);
	}
	return {
		accountBalancesByAccountId,
		assetBalancesByAssetId,
		accountById: new Map(accounts.map((a) => [a.id, a] as const)),
		assetById: new Map(assets.map((a) => [a.id, a] as const))
	};
}
