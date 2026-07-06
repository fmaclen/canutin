import { format } from 'date-fns';

import { toNumber } from '$lib/utils';

export type SecurityBalanceFormData = {
	accountId: string;
	asOf: string;
	quantity: string;
	price: string;
	value: string;
	costBasis: string;
};

export function createSecurityBalanceFormData(): SecurityBalanceFormData {
	return {
		accountId: '',
		asOf: format(new Date(), 'yyyy-MM-dd'),
		quantity: '',
		price: '',
		value: '',
		costBasis: ''
	};
}

export function toSecurityBalanceInput(formData: SecurityBalanceFormData, owner: string) {
	return {
		account: formData.accountId,
		owner,
		asOf: new Date(`${formData.asOf}T12:00:00Z`).toISOString(),
		quantity: toNumber(formData.quantity),
		price: toNumber(formData.price),
		value: toNumber(formData.value),
		costBasis: toNumber(formData.costBasis)
	};
}
