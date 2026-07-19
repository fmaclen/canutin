import { type TrendSecurityBalance } from '$lib/balance-series';
import type {
	AccountBalancesResponse,
	AccountsResponse,
	AssetBalancesResponse,
	AssetsResponse,
	SecuritiesResponse
} from '$lib/pocketbase.schema';

export type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

export type TrendGroupKey = 'net' | 'cash' | 'debt' | 'investment' | 'other';
// NOTE: trends hides the converted-amount indicator (page-scoped FX rule), so only the
// unconvertible warning is tracked per group; the converted values themselves are unchanged.
export type TrendFxFlags = { isUnconverted: boolean };
export type TrendSeriesRow = {
	date: Date;
	net: number;
	cash: number;
	debt: number;
	investment: number;
	other: number;
	fx: Record<TrendGroupKey, TrendFxFlags>;
};

// Per-entity daily series for the group charts: each member is an account (its balance plus
// its positions) or an asset, mapped into its balance group. A null value means the entity
// contributed nothing that day (no balance yet, or closed/sold), which lets a windowed slice
// drop members with no data in its window; contributed zeros stay numeric.
export type TrendMember = { key: string; label: string; group: Exclude<TrendGroupKey, 'net'> };
export type TrendMemberRow = { date: Date; values: Record<string, number | null> };
export type TrendMemberSeries = { members: TrendMember[]; rows: TrendMemberRow[] };

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
