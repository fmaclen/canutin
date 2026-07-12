import { expect, test } from '@playwright/test';

import { getUserPB, seedCurrency, seedExchangeRate, seedUser } from './pocketbase.helpers';

// A currency's owner is fixed at creation: a user PATCH that reassigns it is rejected, while a
// PATCH that leaves the owner untouched still applies its other field changes.
test('currency owner is immutable for a user patch', async () => {
	const mira = await seedUser('mira');
	const soren = await seedUser('soren');
	const currency = await seedCurrency({
		owner: mira.id,
		code: 'IMU',
		name: 'Immutable coin',
		autoUpdate: false
	});
	const miraPB = await getUserPB(mira.email);

	for (const owner of ['', soren.id]) {
		const reassign = miraPB.collection('currencies').update(currency.id, { owner });
		await expect(reassign).rejects.toMatchObject({ status: 400 });
	}

	const updated = await miraPB
		.collection('currencies')
		.update(currency.id, { owner: mira.id, name: 'Updated currency' });
	expect(updated.owner).toBe(mira.id);
	expect(updated.name).toBe('Updated currency');
});

// An exchange rate's owner is fixed at creation the same way: reassigning it via a user PATCH is
// rejected, while a same-owner PATCH still updates the rate value.
test('exchange-rate owner is immutable for a user patch', async () => {
	const elias = await seedUser('elias');
	const petra = await seedUser('petra');
	const rate = await seedExchangeRate({
		owner: elias.id,
		currency: 'IMU',
		date: '2026-01-01T00:00:00.000Z',
		rate: 2
	});
	const eliasPB = await getUserPB(elias.email);

	for (const owner of ['', petra.id]) {
		const reassign = eliasPB.collection('exchangeRates').update(rate.id, { owner });
		await expect(reassign).rejects.toMatchObject({ status: 400 });
	}

	const updated = await eliasPB
		.collection('exchangeRates')
		.update(rate.id, { owner: elias.id, rate: 3.5 });
	expect(updated.owner).toBe(elias.id);
	expect(updated.rate).toBe(3.5);
});
