import { m } from '$lib/paraglide/messages';
import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';

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
