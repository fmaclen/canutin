import { format } from 'date-fns';

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
		quantity: parseOptionalNumber(formData.quantity),
		price: parseOptionalNumber(formData.price),
		value: parseOptionalNumber(formData.value),
		costBasis: parseOptionalNumber(formData.costBasis)
	};
}

function parseOptionalNumber(value: string) {
	if (value.trim() === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}
