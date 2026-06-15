import { subMonths } from 'date-fns';

export interface AccountBalanceDefinition {
	asOf: string;
	value: number;
}

export interface AssetBalanceDefinition {
	asOf: string;
	marketValue: number;
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
		{ asOf: monthsAgo(0, referenceDate), marketValue: 29000 },
		{ asOf: monthsAgo(1, referenceDate), marketValue: 28500 },
		{ asOf: monthsAgo(3, referenceDate), marketValue: 27750 },
		{ asOf: monthsAgo(6, referenceDate), marketValue: 26500 },
		{ asOf: monthsAgo(9, referenceDate), marketValue: 25500 },
		{ asOf: monthsAgo(12, referenceDate), marketValue: 24500 },
		{ asOf: monthsAgo(18, referenceDate), marketValue: 22500 }
	];
}

export function generateGamestopBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), marketValue: 3125 },
		{ asOf: monthsAgo(1, referenceDate), marketValue: 12500 },
		{ asOf: monthsAgo(2, referenceDate), marketValue: 40625 },
		{ asOf: monthsAgo(4, referenceDate), marketValue: 37500 },
		{ asOf: monthsAgo(6, referenceDate), marketValue: 12500 },
		{ asOf: monthsAgo(10, referenceDate), marketValue: 6250 },
		{ asOf: monthsAgo(13, referenceDate), marketValue: 3125 }
	];
}

export function generateBitcoinBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), marketValue: 69420 },
		{ asOf: monthsAgo(1, referenceDate), marketValue: 60900 },
		{ asOf: monthsAgo(5, referenceDate), marketValue: 43225 },
		{ asOf: monthsAgo(7, referenceDate), marketValue: 48840 },
		{ asOf: monthsAgo(13, referenceDate), marketValue: 18948.75 }
	];
}

export function generateEthereumBalances(referenceDate: Date) {
	return [
		{ asOf: monthsAgo(0, referenceDate), marketValue: 17500 },
		{ asOf: monthsAgo(3, referenceDate), marketValue: 8250 },
		{ asOf: monthsAgo(9, referenceDate), marketValue: 5400 },
		{ asOf: monthsAgo(11, referenceDate), marketValue: 2250 },
		{ asOf: monthsAgo(17, referenceDate), marketValue: 2625 }
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
