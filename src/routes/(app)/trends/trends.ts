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
export type TrendSeriesRow = {
	date: Date;
	net: number;
	cash: number;
	debt: number;
	investment: number;
	other: number;
	isUnconverted: Record<TrendGroupKey, boolean>;
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
	for (const balances of [rawAccountBalances, rawSecurityBalances, rawAssetBalances]) {
		for (const balance of balances) {
			const date = new Date(balance.asOf);
			if (!earliest || date < earliest) earliest = date;
		}
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
	const accountBalancesByAccountId = Map.groupBy(accountBalances, (balance) => balance.account);
	const securityBalancesByAccountSecurity = Map.groupBy(
		securityBalances,
		(balance) => `${balance.account}:${balance.security}`
	);
	const assetById = new Map(assets.map((a) => [a.id, a] as const));
	const assetBalancesByAssetId = Map.groupBy(
		assetBalances.filter((balance) => assetById.has(balance.asset)),
		(balance) => balance.asset
	);
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
