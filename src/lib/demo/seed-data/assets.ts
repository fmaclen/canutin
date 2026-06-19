import { AssetsBalanceGroupOptions } from '$lib/pocketbase.schema';

interface AssetDefinition {
	name: string;
	balanceGroup: AssetsBalanceGroupOptions;
	balanceType: string;
}

export const ALL_ASSETS: AssetDefinition[] = [
	{
		name: 'Funko Pop Collection',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Collectible'
	},
	{
		name: '1998 Fiat Multipla',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Vehicle'
	}
];
