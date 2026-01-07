import { m } from '$lib/paraglide/messages';
import { AccountsBalanceGroupOptions, type AccountsResponse } from '$lib/pocketbase.schema';

export const BALANCE_GROUP_ORDER = Object.values(AccountsBalanceGroupOptions);

export type BalanceGroupMeta = {
	label: string;
	color: string;
};

export function getBalanceGroupMeta() {
	return {
		[AccountsBalanceGroupOptions.CASH]: {
			label: m.accounts_group_cash_label(),
			color: 'bg-cash'
		},
		[AccountsBalanceGroupOptions.DEBT]: {
			label: m.accounts_group_debt_label(),
			color: 'bg-debt'
		},
		[AccountsBalanceGroupOptions.INVESTMENT]: {
			label: m.accounts_group_investment_label(),
			color: 'bg-investment'
		},
		[AccountsBalanceGroupOptions.OTHER]: {
			label: m.accounts_group_other_label(),
			color: 'bg-other-assets'
		}
	};
}

export function groupAccountsByBalanceGroup<T extends AccountsResponse>(accounts: T[]) {
	const grouped = new Map<AccountsBalanceGroupOptions, T[]>();
	for (const account of accounts) {
		const group = account.balanceGroup as AccountsBalanceGroupOptions;
		if (!grouped.has(group)) {
			grouped.set(group, []);
		}
		grouped.get(group)!.push(account);
	}
	return grouped;
}
