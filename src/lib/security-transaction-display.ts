import { m } from '$lib/paraglide/messages';
import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';
import type { SecurityTransactionTypeFilter } from '$lib/security-transactions.svelte';

const quantityFormatter = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 8
});

export function formatSecurityQuantity(value: number) {
	return quantityFormatter.format(value);
}

export function securityTransactionTypeLabel(type: SecurityTransactionTypeFilter) {
	switch (type) {
		case SecurityTransactionsTypeOptions.buy:
			return m.trades_type_buy();
		case SecurityTransactionsTypeOptions.sell:
			return m.trades_type_sell();
		case SecurityTransactionsTypeOptions.cancel:
			return m.trades_type_cancel();
		case SecurityTransactionsTypeOptions.cash:
			return m.trades_type_cash();
		case SecurityTransactionsTypeOptions.fee:
			return m.trades_type_fee();
		case SecurityTransactionsTypeOptions.transfer:
			return m.trades_type_transfer();
		case 'all':
			return m.trades_filter_type_all();
	}
}
