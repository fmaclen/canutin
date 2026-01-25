import { AssetsBalanceGroupOptions, AssetsTypeOptions } from '$lib/pocketbase.schema';

export interface AssetDefinition {
	name: string;
	balanceGroup: AssetsBalanceGroupOptions;
	balanceType: string;
	type: AssetsTypeOptions;
	symbol?: string;
}

export const ASSET_SPY: AssetDefinition = {
	name: 'SPDR S&P 500 ETF Trust',
	balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Security',
	type: AssetsTypeOptions.SHARES,
	symbol: 'SPY'
};

export const ASSET_GAMESTOP: AssetDefinition = {
	name: 'GameStop',
	balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Security',
	type: AssetsTypeOptions.SHARES,
	symbol: 'GME'
};

export const ASSET_BITCOIN: AssetDefinition = {
	name: 'Bitcoin',
	balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Cryptocurrency',
	type: AssetsTypeOptions.SHARES,
	symbol: 'BTC'
};

export const ASSET_ETHEREUM: AssetDefinition = {
	name: 'Ethereum',
	balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Cryptocurrency',
	type: AssetsTypeOptions.SHARES,
	symbol: 'ETH'
};

export const ASSET_COLLECTIBLE: AssetDefinition = {
	name: 'Funko Pop Collection',
	balanceGroup: AssetsBalanceGroupOptions.OTHER,
	balanceType: 'Collectible',
	type: AssetsTypeOptions.WHOLE
};

export const ASSET_VEHICLE: AssetDefinition = {
	name: '1998 Fiat Multipla',
	balanceGroup: AssetsBalanceGroupOptions.OTHER,
	balanceType: 'Vehicle',
	type: AssetsTypeOptions.WHOLE
};

export const ALL_ASSETS = [
	ASSET_SPY,
	ASSET_GAMESTOP,
	ASSET_BITCOIN,
	ASSET_ETHEREUM,
	ASSET_COLLECTIBLE,
	ASSET_VEHICLE
];
