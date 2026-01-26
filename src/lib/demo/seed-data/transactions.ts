import { addDays, startOfMonth, subMonths } from 'date-fns';

const MONTHS_IN_SET = 24;

export interface TransactionDefinition {
	description: string;
	value: number;
	date: string;
	label: string;
	isExcluded?: boolean;
}

function toISODate(date: Date): string {
	return date.toISOString().split('T')[0];
}

function getMonthStart(monthsAgo: number, referenceDate: Date): Date {
	return startOfMonth(subMonths(referenceDate, monthsAgo));
}

export function generateCheckingTransactions(referenceDate: Date): TransactionDefinition[] {
	const transactions: TransactionDefinition[] = [];

	for (let i = 0; i < MONTHS_IN_SET; i++) {
		const monthStart = getMonthStart(i, referenceDate);

		transactions.push(
			{
				description: 'Westside Apartments',
				value: -2250,
				date: toISODate(addDays(monthStart, 0)),
				label: 'Rent'
			},
			{
				description: 'Initech HR * Payroll',
				value: 2800,
				date: toISODate(addDays(monthStart, 5)),
				label: 'Payroll & benefits'
			},
			{
				description: 'Transfer to Ransack Savings',
				value: -250,
				date: toISODate(addDays(monthStart, 6)),
				label: 'Transfers'
			},
			{
				description: 'Juggernaut Visa Payment',
				value: i % 2 === 0 ? -1750 : -1500,
				date: toISODate(addDays(monthStart, 7)),
				label: 'Payments'
			},
			{
				description: 'Initech HR * Payroll',
				value: 2800,
				date: toISODate(addDays(monthStart, 20)),
				label: 'Payroll & benefits'
			},
			{
				description: 'Transfer to Loot Financial',
				value: -500,
				date: toISODate(addDays(monthStart, 24)),
				label: 'Transfers'
			},
			{
				description: 'Transfer to MegaCoin Exchange',
				value: i % 3 === 0 ? 0 : -500,
				date: toISODate(addDays(monthStart, 26)),
				label: 'Transfers'
			},
			{
				description: 'Toyota - TFS Payment',
				value: -500,
				date: toISODate(addDays(monthStart, 27)),
				label: 'Automotive'
			}
		);
	}

	return transactions;
}

export function generateSavingsTransactions(referenceDate: Date): TransactionDefinition[] {
	const transactions: TransactionDefinition[] = [];

	for (let i = 0; i < MONTHS_IN_SET; i++) {
		const monthStart = getMonthStart(i, referenceDate);

		transactions.push({
			description: 'Transfer from Ransack Checking',
			value: 250,
			date: toISODate(addDays(monthStart, 6)),
			label: 'Transfers'
		});
	}

	return transactions;
}

export function generateCreditCardTransactions(referenceDate: Date): TransactionDefinition[] {
	const transactions: TransactionDefinition[] = [];

	for (let i = 0; i < MONTHS_IN_SET; i++) {
		const monthStart = getMonthStart(i, referenceDate);

		transactions.push(
			// Groceries
			{
				description: 'Evergreen Market',
				value: -175.75,
				date: toISODate(addDays(monthStart, 1)),
				label: 'Groceries'
			},
			{
				description: 'Evergreen Market',
				value: -135.5,
				date: toISODate(addDays(monthStart, 7)),
				label: 'Groceries'
			},
			{
				description: 'Evergreen Market',
				value: -189.25,
				date: toISODate(addDays(monthStart, 15)),
				label: 'Groceries'
			},
			{
				description: 'Evergreen Market',
				value: -105.5,
				date: toISODate(addDays(monthStart, 23)),
				label: 'Groceries'
			},
			// Food & drink
			{
				description: 'Chorizo King',
				value: -22.5,
				date: toISODate(addDays(monthStart, 3)),
				label: 'Food & drink'
			},
			{
				description: 'Por Que No Los Tacos?',
				value: -19.25,
				date: toISODate(addDays(monthStart, 6)),
				label: 'Food & drink'
			},
			{
				description: "Maria's Artisanal Gelato",
				value: -12.67,
				date: toISODate(addDays(monthStart, 11)),
				label: 'Food & drink'
			},
			// Restaurants
			{
				description: 'Mainely Lobster',
				value: -43.97,
				date: toISODate(addDays(monthStart, 10)),
				label: 'Restaurants'
			},
			{
				description: 'Sunset Cafe',
				value: -17.81,
				date: toISODate(addDays(monthStart, 14)),
				label: 'Restaurants'
			},
			{
				description: 'Stellar Burger',
				value: -16.23,
				date: toISODate(addDays(monthStart, 20)),
				label: 'Restaurants'
			},
			{
				description: "Roy's Steakhouse",
				value: -55.78,
				date: toISODate(addDays(monthStart, 25)),
				label: 'Restaurants'
			},
			{
				description: 'Stellar Burger',
				value: -19.23,
				date: toISODate(addDays(monthStart, 26)),
				label: 'Restaurants'
			},
			// Subscriptions
			{
				description: 'NetTV Max',
				value: -14.99,
				date: toISODate(addDays(monthStart, 2)),
				label: 'Subscriptions'
			},
			// Shops
			{
				description: 'Store.com',
				value: -25.9,
				date: toISODate(addDays(monthStart, 12)),
				label: 'Shops'
			},
			{
				description: 'Store.com',
				value: -24.21,
				date: toISODate(addDays(monthStart, 18)),
				label: 'Shops',
				isExcluded: true
			},
			{
				description: 'Store.com (Refund)',
				value: 24.21,
				date: toISODate(addDays(monthStart, 26)),
				label: 'Shops',
				isExcluded: true
			},
			// Gas stations
			{
				description: 'Florida Man (Gas & Convenience Store)',
				value: -25.67,
				date: toISODate(addDays(monthStart, 7)),
				label: 'Gas stations'
			},
			{
				description: 'Florida Man (Gas & Convenience Store)',
				value: -40.01,
				date: toISODate(addDays(monthStart, 24)),
				label: 'Gas stations'
			},
			// Internet & phone
			{
				description: 'Horizon Wireless',
				value: -90.5,
				date: toISODate(addDays(monthStart, 2)),
				label: 'Internet & phone'
			},
			// Insurance
			{
				description: 'Patriot Insurance',
				value: -135.67,
				date: toISODate(addDays(monthStart, 27)),
				label: 'Insurance'
			},
			// Home (variable)
			{
				description: i % 7 === 0 ? 'Hølm Home' : 'The Hardware Center',
				value: i % 7 === 0 ? -215.43 : -95.89,
				date: toISODate(addDays(monthStart, 16)),
				label: i % 2 === 0 ? 'Furnishings' : 'Home maintenance'
			},
			// Electronics/Music (variable)
			{
				description: i % 5 === 0 ? 'ShortCircuit Computers' : 'alphaStream',
				value: i % 5 === 0 ? -649.99 : -4.99,
				date: toISODate(addDays(monthStart, 26)),
				label: i % 5 === 0 ? 'Electronics' : 'Music'
			},
			// Health
			{
				description: 'PurpleShield Health',
				value: -254.84,
				date: toISODate(addDays(monthStart, 3)),
				label: 'Health'
			},
			// Health/Restaurant (variable)
			{
				description: i % 7 === 0 ? 'Narby Warker' : "Stefano's Pizza by the Slice",
				value: i % 7 === 0 ? -150 : -7.78,
				date: toISODate(addDays(monthStart, 13)),
				label: i % 7 === 0 ? 'Health' : 'Restaurants'
			},
			// Office/Entertainment (variable)
			{
				description: i % 9 === 0 ? '9-5 Office Supplies' : 'Flix Movie Rentals',
				value: i % 9 === 0 ? -98.23 : -4.99,
				date: toISODate(addDays(monthStart, 13)),
				label: i % 9 === 0 ? 'Office supplies' : 'Entertainment & recreation'
			},
			// Rebates/Cash back (variable)
			{
				description:
					i % 11 === 0
						? 'Horizon Wireless (Promotional Rebate)'
						: 'Juggernaut Cash Back Redemption',
				value: i % 11 === 0 ? 445 : 25.33,
				date: toISODate(addDays(monthStart, 15)),
				label: i % 11 === 0 ? 'Internet & phone' : 'Financial & banking'
			},
			// Payment received
			{
				description: 'Ransack Bank Payment Received — Thank You',
				value: i % 3 === 0 ? 1755 : i % 6 === 0 ? 2355 : i % 9 === 0 ? 1945 : 1675,
				date: toISODate(addDays(monthStart, 8)),
				label: 'Payments'
			},
			// Interest fees
			{
				description: 'Juggernaut Visa Interest',
				value: -56.89,
				date: toISODate(addDays(monthStart, 8)),
				label: 'Fees'
			}
		);
	}

	return transactions;
}
