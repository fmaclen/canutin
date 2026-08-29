import { m } from '$lib/paraglide/messages';
import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';

export const BALANCE_GROUP_ORDER = Object.values(AccountsBalanceGroupOptions);

export function getBalanceGroupMeta() {
	return {
		[AccountsBalanceGroupOptions.CASH]: {
			label: m.accounts_group_cash_label(),
			color: 'bg-cash',
			variant: 'cash' as const
		},
		[AccountsBalanceGroupOptions.DEBT]: {
			label: m.accounts_group_debt_label(),
			color: 'bg-debt',
			variant: 'debt' as const
		},
		[AccountsBalanceGroupOptions.INVESTMENT]: {
			label: m.accounts_group_investment_label(),
			color: 'bg-investment',
			variant: 'investment' as const
		},
		[AccountsBalanceGroupOptions.OTHER]: {
			label: m.accounts_group_other_label(),
			color: 'bg-other-assets',
			variant: 'other' as const
		}
	};
}
