import { subMonths } from 'date-fns';

export interface AccountBalanceDefinition {
	asOf: string;
	value: number;
}

export interface AssetBalanceDefinition {
	asOf: string;
	marketValue: number;
}

export interface SecurityBalanceDefinition {
	asOf: string;
	quantity: number;
	price: number;
	costBasis: number;
	value: number;
}

function toISODate(date: Date) {
	return date.toISOString().split('T')[0];
}

function monthsAgo(months: number, referenceDate: Date) {
	return toISODate(subMonths(referenceDate, months));
}

export function generateAutoLoanBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), value: -21250 },
		{ asOf: monthsAgo(1, referenceDate), value: -23500 },
		{ asOf: monthsAgo(2, referenceDate), value: -24000 },
		{ asOf: monthsAgo(3, referenceDate), value: -25500 },
		{ asOf: monthsAgo(4, referenceDate), value: -27000 },
		{ asOf: monthsAgo(5, referenceDate), value: -29500 },
		{ asOf: monthsAgo(6, referenceDate), value: -30000 },
		{ asOf: monthsAgo(7, referenceDate), value: -32500 },
		{ asOf: monthsAgo(8, referenceDate), value: -33000 },
		{ asOf: monthsAgo(9, referenceDate), value: -34500 },
		{ asOf: monthsAgo(10, referenceDate), value: -36000 },
		{ asOf: monthsAgo(11, referenceDate), value: -37500 },
		{ asOf: monthsAgo(12, referenceDate), value: -38000 },
		{ asOf: monthsAgo(13, referenceDate), value: -39500 },
		{ asOf: monthsAgo(14, referenceDate), value: -40000 },
		{ asOf: monthsAgo(15, referenceDate), value: -41500 },
		{ asOf: monthsAgo(16, referenceDate), value: -42000 },
		{ asOf: monthsAgo(17, referenceDate), value: -42500 }
	];
}

export function generateRothIraBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), value: 18535.78 },
		{ asOf: monthsAgo(1, referenceDate), value: 18035.65 },
		{ asOf: monthsAgo(3, referenceDate), value: 17535.12 },
		{ asOf: monthsAgo(5, referenceDate), value: 17035.23 },
		{ asOf: monthsAgo(7, referenceDate), value: 16535.78 },
		{ asOf: monthsAgo(9, referenceDate), value: 16035.45 },
		{ asOf: monthsAgo(11, referenceDate), value: 15535.67 },
		{ asOf: monthsAgo(13, referenceDate), value: 15035.92 },
		{ asOf: monthsAgo(15, referenceDate), value: 14535.12 },
		{ asOf: monthsAgo(17, referenceDate), value: 14035.18 },
		{ asOf: monthsAgo(19, referenceDate), value: 13535.98 },
		{ asOf: monthsAgo(21, referenceDate), value: 13035.75 },
		{ asOf: monthsAgo(23, referenceDate), value: 12535.45 },
		{ asOf: monthsAgo(25, referenceDate), value: 12035.38 }
	];
}

export function generate401kBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), value: 4250.58 },
		{ asOf: monthsAgo(1, referenceDate), value: 4000.25 },
		{ asOf: monthsAgo(3, referenceDate), value: 3250.66 },
		{ asOf: monthsAgo(5, referenceDate), value: 3000.33 },
		{ asOf: monthsAgo(7, referenceDate), value: 2750.49 },
		{ asOf: monthsAgo(9, referenceDate), value: 2500.58 },
		{ asOf: monthsAgo(11, referenceDate), value: 2250.25 },
		{ asOf: monthsAgo(13, referenceDate), value: 2000.78 },
		{ asOf: monthsAgo(15, referenceDate), value: 1750.9 },
		{ asOf: monthsAgo(17, referenceDate), value: 1500.32 },
		{ asOf: monthsAgo(19, referenceDate), value: 1250.29 },
		{ asOf: monthsAgo(21, referenceDate), value: 1000.45 },
		{ asOf: monthsAgo(23, referenceDate), value: 750.12 },
		{ asOf: monthsAgo(25, referenceDate), value: 500.23 }
	];
}

export function generateWalletBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(7, referenceDate), value: 1300 },
		{ asOf: monthsAgo(18, referenceDate), value: 700 }
	];
}

export function generateSpyBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), quantity: 50, price: 580, costBasis: 22500, value: 29000 },
		{ asOf: monthsAgo(1, referenceDate), quantity: 50, price: 570, costBasis: 22500, value: 28500 },
		{ asOf: monthsAgo(3, referenceDate), quantity: 50, price: 555, costBasis: 22500, value: 27750 },
		{ asOf: monthsAgo(6, referenceDate), quantity: 50, price: 530, costBasis: 22500, value: 26500 },
		{ asOf: monthsAgo(9, referenceDate), quantity: 50, price: 510, costBasis: 22500, value: 25500 },
		{
			asOf: monthsAgo(12, referenceDate),
			quantity: 50,
			price: 490,
			costBasis: 22500,
			value: 24500
		},
		{ asOf: monthsAgo(18, referenceDate), quantity: 50, price: 450, costBasis: 22500, value: 22500 }
	];
}

export function generateGamestopBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), quantity: 125, price: 25, costBasis: 6250, value: 3125 },
		{ asOf: monthsAgo(1, referenceDate), quantity: 125, price: 100, costBasis: 6250, value: 12500 },
		{ asOf: monthsAgo(2, referenceDate), quantity: 125, price: 325, costBasis: 6250, value: 40625 },
		{ asOf: monthsAgo(4, referenceDate), quantity: 125, price: 300, costBasis: 6250, value: 37500 },
		{ asOf: monthsAgo(6, referenceDate), quantity: 125, price: 100, costBasis: 6250, value: 12500 },
		{ asOf: monthsAgo(10, referenceDate), quantity: 125, price: 50, costBasis: 6250, value: 6250 },
		{ asOf: monthsAgo(13, referenceDate), quantity: 125, price: 25, costBasis: 6250, value: 3125 }
	];
}

export function generateBitcoinBalances(referenceDate: Date) {
	return [
		{
			asOf: monthsAgo(0, referenceDate),
			quantity: 1.5,
			price: 46280,
			costBasis: 37897.5,
			value: 69420
		},
		{
			asOf: monthsAgo(1, referenceDate),
			quantity: 1.4,
			price: 43500,
			costBasis: 35371,
			value: 60900
		},
		{
			asOf: monthsAgo(5, referenceDate),
			quantity: 1.3,
			price: 33250,
			costBasis: 32844.5,
			value: 43225
		},
		{
			asOf: monthsAgo(7, referenceDate),
			quantity: 1.2,
			price: 40700,
			costBasis: 30318,
			value: 48840
		},
		{
			asOf: monthsAgo(13, referenceDate),
			quantity: 0.75,
			price: 25265,
			costBasis: 18948.75,
			value: 18948.75
		}
	];
}

export function generateEthereumBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), quantity: 5, price: 3500, costBasis: 8750, value: 17500 },
		{ asOf: monthsAgo(3, referenceDate), quantity: 3, price: 2750, costBasis: 5250, value: 8250 },
		{ asOf: monthsAgo(9, referenceDate), quantity: 3, price: 1800, costBasis: 5250, value: 5400 },
		{ asOf: monthsAgo(11, referenceDate), quantity: 1, price: 2250, costBasis: 1750, value: 2250 },
		{ asOf: monthsAgo(17, referenceDate), quantity: 1.5, price: 1750, costBasis: 2625, value: 2625 }
	];
}

export function generateCollectibleBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(6, referenceDate), marketValue: 14500 },
		{ asOf: monthsAgo(18, referenceDate), marketValue: 9500 }
	];
}

export function generateVehicleBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(4, referenceDate), marketValue: 38500 },
		{ asOf: monthsAgo(8, referenceDate), marketValue: 40250 },
		{ asOf: monthsAgo(14, referenceDate), marketValue: 42500 }
	];
}
