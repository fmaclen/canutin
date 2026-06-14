import { m } from '$lib/paraglide/messages';
import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';

export function tradeTypeLabel(type: SecurityTransactionsTypeOptions) {
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
	}
}
