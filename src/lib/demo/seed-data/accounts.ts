import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';

export interface AccountDefinition {
	name: string;
	balanceGroup: AccountsBalanceGroupOptions;
	balanceType: string;
	institution?: string;
	isAutoCalculated: boolean;
}

export const ACCOUNT_CHECKING: AccountDefinition = {
	name: "Bob's Laughable-Yield Checking",
	balanceGroup: AccountsBalanceGroupOptions.CASH,
	balanceType: 'Checking',
	institution: 'Ransack Bank',
	isAutoCalculated: true
};

export const ACCOUNT_SAVINGS: AccountDefinition = {
	name: 'Emergency Fund',
	balanceGroup: AccountsBalanceGroupOptions.CASH,
	balanceType: 'Savings',
	institution: 'Ransack Bank',
	isAutoCalculated: true
};

export const ACCOUNT_CREDIT_CARD: AccountDefinition = {
	name: "Alice's Limited Rewards Credit Card",
	balanceGroup: AccountsBalanceGroupOptions.DEBT,
	balanceType: 'Credit Card',
	institution: 'Juggernaut Bank',
	isAutoCalculated: true
};

export const ACCOUNT_AUTO_LOAN: AccountDefinition = {
	name: 'Fiat Auto Loan',
	balanceGroup: AccountsBalanceGroupOptions.DEBT,
	balanceType: 'Auto Loan',
	institution: 'Fiat Financial Services',
	isAutoCalculated: false
};

export const ACCOUNT_ROTH_IRA: AccountDefinition = {
	name: "Alice's Roth IRA",
	balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Roth IRA',
	institution: 'Loot Financial',
	isAutoCalculated: false
};

export const ACCOUNT_401K: AccountDefinition = {
	name: "Bob's 401k",
	balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
	balanceType: '401k',
	institution: 'Loot Financial',
	isAutoCalculated: false
};

export const ACCOUNT_WALLET: AccountDefinition = {
	name: 'Mattress Wallet',
	balanceGroup: AccountsBalanceGroupOptions.CASH,
	balanceType: 'Cash',
	isAutoCalculated: false
};

export const ACCOUNT_CRYPTO_BROKERAGE: AccountDefinition = {
	name: "Alice's Crypto Brokerage",
	balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
	balanceType: 'Crypto',
	institution: 'Coinpurse',
	isAutoCalculated: false
};

export const ALL_ACCOUNTS = [
	ACCOUNT_CHECKING,
	ACCOUNT_SAVINGS,
	ACCOUNT_CREDIT_CARD,
	ACCOUNT_AUTO_LOAN,
	ACCOUNT_ROTH_IRA,
	ACCOUNT_401K,
	ACCOUNT_WALLET,
	ACCOUNT_CRYPTO_BROKERAGE
];
