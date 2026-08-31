export const IMPORT_PATH = '/api/canutin/import';

// Scraper-shaped payload the import specs post. `sessionLabel` is the only variable part, so a
// test can post the same records twice under different labels to exercise dedup.
export function importPayload(sessionLabel: string) {
	return {
		sessionLabel,
		accounts: [
			{
				name: 'Nathan Checking',
				institution: 'First National',
				balanceGroup: 'CASH',
				balanceType: 'Checking',
				autoCalculated: true,
				balance: { value: 3000, asOf: '2025-06-15T00:00:00.000Z' }
			},
			{
				name: 'Nathan Credit Card',
				institution: 'First National',
				balanceGroup: 'DEBT',
				balanceType: 'Credit Card',
				balance: { value: -450, asOf: '2025-06-15T00:00:00.000Z' }
			}
		],
		assets: [
			{
				name: 'Nathan Rental Property',
				balanceGroup: 'INVESTMENT',
				balanceType: 'Property',
				balance: {
					marketValue: 275000,
					bookValue: 250000,
					asOf: '2025-06-15T00:00:00.000Z'
				}
			}
		],
		transactions: [
			{
				accountName: 'Nathan Checking',
				date: '2025-06-10T00:00:00.000Z',
				description: 'Payroll Deposit',
				value: 2500,
				externalId: 'txn-001',
				labels: ['Payroll']
			},
			{
				accountName: 'Nathan Checking',
				date: '2025-06-11T00:00:00.000Z',
				description: 'Grocery Store',
				value: -85.5,
				labels: ['Groceries']
			},
			{
				accountName: 'Nathan Credit Card',
				date: '2025-06-12T00:00:00.000Z',
				description: 'Online Purchase',
				value: -42.99,
				externalId: 'txn-cc-001'
			}
		]
	};
}

// Brokerage payload that references three securities but declares only one up front, so
// the import's auto-create path is always exercised.
export function securitiesPayload(sessionLabel: string) {
	return {
		sessionLabel,
		accounts: [
			{
				name: 'Brokerage',
				institution: 'Vanguard',
				balanceGroup: 'INVESTMENT',
				balanceType: 'Brokerage'
			}
		],
		securities: [{ name: 'Apple Inc', symbol: 'AAPL' }],
		securityBalances: [
			{
				accountName: 'Brokerage',
				securityName: 'Microsoft Corp',
				securitySymbol: 'MSFT',
				asOf: '2025-06-15T00:00:00.000Z',
				quantity: 5,
				price: 400,
				value: 2000,
				costBasis: 1800
			}
		],
		securityTransactions: [
			{
				accountName: 'Brokerage',
				securityName: 'Tesla Inc',
				securitySymbol: 'TSLA',
				date: '2025-06-10T00:00:00.000Z',
				type: 'buy',
				description: 'Bought Tesla shares',
				quantity: 2,
				price: 250,
				amount: 500
			}
		]
	};
}
