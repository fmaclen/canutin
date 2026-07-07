import { UTCDate } from '@date-fns/utc';
import { startOfDay, startOfYear, subMonths, subYears } from 'date-fns';

import { type TrendSecurityBalance } from '$lib/balance-series';
import type {
	AccountBalancesResponse,
	AccountsResponse,
	AssetBalancesResponse,
	AssetsResponse,
	SecuritiesResponse
} from '$lib/pocketbase.schema';

export type PeriodKey = '3m' | '6m' | 'ytd' | '1y' | '2y' | '5y' | 'max';
export type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

export function computeBoundedHistoryStart(period: PeriodKey) {
	const now = startOfDay(new UTCDate());
	if (period === '3m') return subMonths(now, 3);
	if (period === '6m') return subMonths(now, 6);
	if (period === 'ytd') return startOfYear(now);
	if (period === '1y') return subYears(now, 1);
	if (period === '2y') return subYears(now, 2);
	if (period === '5y') return subYears(now, 5);
	return null;
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
	const now = startOfDay(new UTCDate());
	const boundedStart = computeBoundedHistoryStart(period);
	if (boundedStart) return { start: boundedStart, end: now };

	const earliest = findEarliestBalanceDate(
		rawAccountBalances,
		rawSecurityBalances,
		rawAssetBalances
	);
	const start = earliest ? startOfDay(new UTCDate(earliest.getTime())) : subYears(now, 1);
	return { start, end: now };
}

export function buildPreparedMaps(
	accounts: AccountsResponse[],
	assets: AssetsResponse[],
	securities: SecuritiesResponse[],
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
	const assetById = new Map(assets.map((a) => [a.id, a] as const));
	const assetBalancesByAssetId = new Map<string, AssetBalancesResponse[]>();
	for (const balance of assetBalances) {
		if (!assetById.has(balance.asset)) continue;
		const existing = assetBalancesByAssetId.get(balance.asset) || [];
		existing.push(balance);
		assetBalancesByAssetId.set(balance.asset, existing);
	}
	return {
		accountBalancesByAccountId,
		securityBalancesByAccountSecurity,
		assetBalancesByAssetId,
		accountById: new Map(accounts.map((a) => [a.id, a] as const)),
		assetById,
		securityCurrencyById: new Map(
			securities.map((security) => [security.id, security.currency] as const)
		)
	};
}

export type PreparedTrendMaps = ReturnType<typeof buildPreparedMaps>;
