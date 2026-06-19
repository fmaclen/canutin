import { subDays } from 'date-fns';

import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';

import { ACCOUNT_401K, ACCOUNT_CRYPTO_BROKERAGE, ACCOUNT_ROTH_IRA } from './accounts';

export interface DemoSecurity {
	name: string;
	symbol: string;
	account: string;
}

export interface DemoSecurityBalance {
	asOf: string;
	quantity: number;
	price: number;
	value: number;
	costBasis: number;
}

export interface DemoTrade {
	date: string;
	type: SecurityTransactionsTypeOptions;
	description: string;
	quantity?: number;
	price?: number;
	amount?: number;
	fees?: number;
}

const SECURITY_SPY = 'SPDR S&P 500 ETF Trust';
const SECURITY_GAMESTOP = 'GameStop';
const SECURITY_BITCOIN = 'Bitcoin';
const SECURITY_ETHEREUM = 'Ethereum';

export const ALL_SECURITIES: DemoSecurity[] = [
	{ name: SECURITY_SPY, symbol: 'SPY', account: ACCOUNT_401K.name },
	{ name: SECURITY_GAMESTOP, symbol: 'GME', account: ACCOUNT_ROTH_IRA.name },
	{ name: SECURITY_BITCOIN, symbol: 'BTC', account: ACCOUNT_CRYPTO_BROKERAGE.name },
	{ name: SECURITY_ETHEREUM, symbol: 'ETH', account: ACCOUNT_CRYPTO_BROKERAGE.name }
];

interface SeriesTrade {
	daysAgo: number;
	type: SecurityTransactionsTypeOptions;
	quantity: number;
	price: number;
	fees: number;
}

interface SeriesSnapshot {
	daysAgo: number;
	price: number;
}

interface SecuritySeries {
	trades: SeriesTrade[];
	// Market prices used to value the position at each balance snapshot. The
	// daysAgo: 0 price multiplied by the net held quantity must equal the
	// pinned latest value asserted by e2e/demo-seed.test.ts.
	snapshots: SeriesSnapshot[];
}

const BUY = SecurityTransactionsTypeOptions.buy;
const SELL = SecurityTransactionsTypeOptions.sell;

// Every trade lands within the last ~45 days so it stays visible under the
// trades ledger's default "last 3 months" filter for any run date. The stories
// and net quantities are unchanged - only the dates are compressed.
const SECURITY_SERIES: Record<string, SecuritySeries> = {
	// Dollar-cost-averaging into the index. Net 50 shares.
	// Latest: 50 x 580 = 29,000.
	[SECURITY_SPY]: {
		trades: [
			{ daysAgo: 45, type: BUY, quantity: 20, price: 450, fees: 5 },
			{ daysAgo: 30, type: BUY, quantity: 15, price: 490, fees: 5 },
			{ daysAgo: 15, type: BUY, quantity: 10, price: 530, fees: 5 },
			{ daysAgo: 5, type: BUY, quantity: 5, price: 565, fees: 5 }
		],
		snapshots: [
			{ daysAgo: 45, price: 450 },
			{ daysAgo: 30, price: 490 },
			{ daysAgo: 15, price: 530 },
			{ daysAgo: 7, price: 555 },
			{ daysAgo: 5, price: 565 },
			{ daysAgo: 0, price: 580 }
		]
	},
	// The meme story: buy in, sell a big chunk near the peak for a fat realized
	// gain, then re-buy after the crash. Net 125 shares.
	// Latest: 125 x 25 = 3,125.
	[SECURITY_GAMESTOP]: {
		trades: [
			{ daysAgo: 45, type: BUY, quantity: 200, price: 40, fees: 10 },
			{ daysAgo: 35, type: SELL, quantity: 100, price: 325, fees: 25 },
			{ daysAgo: 10, type: BUY, quantity: 25, price: 28, fees: 5 }
		],
		snapshots: [
			{ daysAgo: 45, price: 40 },
			{ daysAgo: 35, price: 325 },
			{ daysAgo: 20, price: 90 },
			{ daysAgo: 10, price: 28 },
			{ daysAgo: 3, price: 24 },
			{ daysAgo: 0, price: 25 }
		]
	},
	// Initial buy plus a buy-the-dip. Net 0.75 BTC.
	// Latest: 0.75 x 92,560 = 69,420.
	[SECURITY_BITCOIN]: {
		trades: [
			{ daysAgo: 40, type: BUY, quantity: 0.5, price: 35000, fees: 20 },
			{ daysAgo: 12, type: BUY, quantity: 0.25, price: 44000, fees: 15 }
		],
		snapshots: [
			{ daysAgo: 40, price: 35000 },
			{ daysAgo: 25, price: 51000 },
			{ daysAgo: 12, price: 44000 },
			{ daysAgo: 4, price: 84000 },
			{ daysAgo: 0, price: 92560 }
		]
	},
	// Initial buy plus a follow-up buy. Net 5 ETH.
	// Latest: 5 x 3,500 = 17,500.
	[SECURITY_ETHEREUM]: {
		trades: [
			{ daysAgo: 42, type: BUY, quantity: 3, price: 1800, fees: 10 },
			{ daysAgo: 18, type: BUY, quantity: 2, price: 2400, fees: 10 }
		],
		snapshots: [
			{ daysAgo: 42, price: 1800 },
			{ daysAgo: 30, price: 1500 },
			{ daysAgo: 18, price: 2400 },
			{ daysAgo: 8, price: 2900 },
			{ daysAgo: 0, price: 3500 }
		]
	}
};

const SECURITY_LABELS: Record<string, string> = {
	[SECURITY_SPY]: 'SPDR S&P 500',
	[SECURITY_GAMESTOP]: 'GameStop',
	[SECURITY_BITCOIN]: 'Bitcoin',
	[SECURITY_ETHEREUM]: 'Ethereum'
};

function toISODate(date: Date) {
	return date.toISOString().split('T')[0];
}

function daysAgo(days: number, referenceDate: Date) {
	return toISODate(subDays(referenceDate, days));
}

function roundToCents(value: number) {
	return Math.round(value * 100) / 100;
}

export function generateSecurityBalances(name: string, referenceDate: Date) {
	const series = SECURITY_SERIES[name];

	return series.snapshots.map(({ daysAgo: days, price }) => {
		// Trades up to (and including) this snapshot, oldest first.
		const tradesToDate = series.trades
			.filter((trade) => trade.daysAgo >= days)
			.sort((a, b) => b.daysAgo - a.daysAgo);

		// Fold trades chronologically. A sell reduces the held cost basis by the
		// average cost of the shares sold, so the remaining position keeps a
		// realistic (non-negative) cost basis even after a profitable sale.
		let quantity = 0;
		let costBasis = 0;
		for (const trade of tradesToDate) {
			if (trade.type === BUY) {
				quantity += trade.quantity;
				costBasis += trade.quantity * trade.price;
			} else {
				const averageCost = quantity > 0 ? costBasis / quantity : 0;
				quantity -= trade.quantity;
				costBasis -= trade.quantity * averageCost;
			}
		}

		quantity = roundToCents(quantity);

		return {
			asOf: daysAgo(days, referenceDate),
			quantity,
			price,
			value: roundToCents(quantity * price),
			costBasis: roundToCents(costBasis)
		};
	});
}

export function generateSecurityTrades(name: string, referenceDate: Date) {
	const series = SECURITY_SERIES[name];
	const label = SECURITY_LABELS[name];

	return series.trades.map((trade) => ({
		date: daysAgo(trade.daysAgo, referenceDate),
		type: trade.type,
		description: `${trade.type === BUY ? 'Bought' : 'Sold'} ${label}`,
		quantity: trade.quantity,
		price: trade.price,
		amount: roundToCents(trade.quantity * trade.price),
		fees: trade.fees
	}));
}
