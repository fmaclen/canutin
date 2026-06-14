interface SecurityDefinition {
	name: string;
	symbol: string;
}

export const ALL_SECURITIES: SecurityDefinition[] = [
	{
		name: 'SPDR S&P 500 ETF Trust',
		symbol: 'SPY'
	},
	{
		name: 'GameStop',
		symbol: 'GME'
	},
	{
		name: 'Bitcoin',
		symbol: 'BTC'
	},
	{
		name: 'Ethereum',
		symbol: 'ETH'
	}
];
