import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import {
	getUserPB,
	pbSend,
	seedAccount,
	seedSecurity,
	seedSecurityBalance,
	seedUser
} from './pocketbase.helpers';

const PATH = '/api/canutin/securities/with-initial-transaction';

function buildBody(ownerId: string, accountId: string) {
	return {
		security: { name: 'API Fund', symbol: 'APIF', owner: ownerId, currency: 'USD' },
		transaction: {
			account: accountId,
			owner: ownerId,
			date: '2026-01-01 00:00:00.000Z',
			type: SecurityTransactionsTypeOptions.buy,
			subtype: '',
			description: 'Initial purchase',
			quantity: 1,
			price: 10,
			amount: 10,
			fees: null,
			notes: ''
		}
	};
}

test('with-initial-transaction rejects owner mismatch', async () => {
	const alice = await seedUser('hazel');
	const bob = await seedUser('rowan');
	const account = await seedAccount({
		name: 'Owner Mismatch Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: alice.id,
		balanceType: 'Brokerage'
	});
	const body = buildBody(alice.id, account.id);
	body.transaction.owner = bob.id;

	const response = await pbSend(PATH, body, alice.email);
	expect(response.status).toBe(403);
	const payload = await response.json();
	expect(payload.message).toContain('Owner must match');
});

test('with-initial-transaction rejects a foreign account', async () => {
	const alice = await seedUser('bryony');
	const bob = await seedUser('cedar');
	const bobsAccount = await seedAccount({
		name: 'Foreign Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: bob.id,
		balanceType: 'Brokerage'
	});

	const response = await pbSend(PATH, buildBody(alice.id, bobsAccount.id), alice.email);
	expect(response.status).toBe(404);
	const payload = await response.json();
	expect(payload.message).toContain('Account not found');
});

test('with-initial-transaction rejects a closed account and persists nothing', async () => {
	const alice = await seedUser('dahlia');
	const closedAccount = await seedAccount({
		name: 'Closed Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: alice.id,
		balanceType: 'Brokerage',
		closed: new Date().toISOString()
	});

	const response = await pbSend(PATH, buildBody(alice.id, closedAccount.id), alice.email);
	expect(response.status).toBe(400);
	const payload = await response.json();
	expect(payload.message).toContain('Account is closed');

	const pb = await getUserPB(alice.email);
	expect(await pb.collection('securities').getFullList()).toHaveLength(0);
	expect(await pb.collection('securityTransactions').getFullList()).toHaveLength(0);
});

test('with-initial-transaction rolls back the security when the transaction is invalid', async () => {
	const alice = await seedUser('echinacea');
	const account = await seedAccount({
		name: 'Rollback Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: alice.id,
		balanceType: 'Brokerage'
	});
	const body = buildBody(alice.id, account.id);

	const response = await pbSend(
		PATH,
		{
			...body,
			transaction: { ...body.transaction, type: 'invalid-transaction-type' }
		},
		alice.email
	);
	expect(response.status).toBe(400);

	const pb = await getUserPB(alice.email);
	expect(await pb.collection('securities').getFullList()).toHaveLength(0);
	expect(await pb.collection('securityTransactions').getFullList()).toHaveLength(0);
});

test('with-initial-transaction rejects an unauthenticated request', async () => {
	const alice = await seedUser('fennel');
	const account = await seedAccount({
		name: 'Unauthenticated Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: alice.id,
		balanceType: 'Brokerage'
	});

	const response = await pbSend(PATH, buildBody(alice.id, account.id));
	expect(response.status).toBe(401);
});

test('duplicate security names return a field code on every create path', async () => {
	const alice = await seedUser('ginkgo');
	const account = await seedAccount({
		name: 'Duplicate Name Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: alice.id,
		balanceType: 'Brokerage'
	});
	await seedSecurity({ name: 'API Fund', symbol: 'EXIST', owner: alice.id });

	const endpointResponse = await pbSend(PATH, buildBody(alice.id, account.id), alice.email);
	expect(endpointResponse.status).toBe(400);
	const endpointPayload = await endpointResponse.json();
	expect(endpointPayload.data.name.code).toBe('security_name_exists');

	const collectionResponse = await pbSend(
		'/api/collections/securities/records',
		{ name: 'API Fund', symbol: 'PLAIN', owner: alice.id, currency: 'USD' },
		alice.email
	);
	expect(collectionResponse.status).toBe(400);
	const collectionPayload = await collectionResponse.json();
	expect(collectionPayload.data.name.code).toBe('security_name_exists');
});

test('latest security balances resolve carry-forward per holding', async () => {
	const elowen = await seedUser('elowen');
	const account = await seedAccount({
		name: 'Carry Forward Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: elowen.id,
		balanceType: 'Brokerage'
	});
	// Each security's rows are listed oldest first; only its newest row comes back from the view.
	const histories = {
		'Carried Fund': [
			{ asOf: '2026-01-01', quantity: 10, price: 100, value: 1000, costBasis: 900 },
			{ asOf: '2026-02-01', quantity: 10, price: null, value: null, costBasis: null },
			{ asOf: '2026-03-01', quantity: 10, price: null, value: null, costBasis: null }
		],
		'Rebought Fund': [
			{ asOf: '2026-01-01', quantity: 5, price: 100, value: 500, costBasis: 450 },
			{ asOf: '2026-02-01', quantity: 0, price: 110, value: 0, costBasis: 0 },
			{ asOf: '2026-03-01', quantity: 5, price: null, value: null, costBasis: null }
		],
		'Sold Fund': [
			{ asOf: '2026-01-01', quantity: 4, price: 100, value: 400, costBasis: 350 },
			{ asOf: '2026-02-01', quantity: 0, price: null, value: null, costBasis: null }
		],
		'Resized Fund': [
			{ asOf: '2026-01-01', quantity: 10, price: 100, value: 1000, costBasis: 900 },
			{ asOf: '2026-02-01', quantity: 12, price: 110, value: 1320, costBasis: null }
		],
		'Unknown Fund': [
			{ asOf: '2026-01-01', quantity: 2, price: null, value: null, costBasis: null }
		],
		// Two balances on the same day: the one created later wins.
		'Same Day Fund': [
			{ asOf: '2026-01-01', quantity: 1, price: 100, value: 100, costBasis: 100 },
			{ asOf: '2026-01-01', quantity: 1, price: 120, value: 120, costBasis: 100 }
		]
	};
	const newestIds = new Map<string, string>();
	for (const [name, history] of Object.entries(histories)) {
		const security = await seedSecurity({ name, owner: elowen.id });
		for (const balance of history) {
			const created = await seedSecurityBalance({
				...balance,
				asOf: `${balance.asOf} 00:00:00.000Z`,
				account: account.id,
				security: security.id,
				owner: elowen.id
			});
			newestIds.set(security.id, created.id);
		}
	}

	const pb = await getUserPB(elowen.email);
	const securities = await pb.collection('securities').getFullList();
	const nameById = new Map(securities.map((security) => [security.id, security.name]));
	const latest = await pb.collection('latestSecurityBalances').getFullList();
	for (const balance of latest) expect(balance.id).toBe(newestIds.get(balance.security));
	const resolved = Object.fromEntries(
		latest.map((balance) => [
			nameById.get(balance.security),
			{
				asOf: balance.asOf,
				quantity: balance.quantity,
				price: balance.price,
				value: balance.value,
				costBasis: balance.costBasis
			}
		])
	);
	expect(resolved).toEqual({
		'Carried Fund': {
			asOf: '2026-03-01 00:00:00.000Z',
			quantity: 10,
			price: null,
			value: 1000,
			costBasis: 900
		},
		'Rebought Fund': {
			asOf: '2026-03-01 00:00:00.000Z',
			quantity: 5,
			price: null,
			value: null,
			costBasis: null
		},
		'Sold Fund': {
			asOf: '2026-02-01 00:00:00.000Z',
			quantity: 0,
			price: null,
			value: 0,
			costBasis: 0
		},
		'Resized Fund': {
			asOf: '2026-02-01 00:00:00.000Z',
			quantity: 12,
			price: 110,
			value: 1320,
			costBasis: null
		},
		'Unknown Fund': {
			asOf: '2026-01-01 00:00:00.000Z',
			quantity: 2,
			price: null,
			value: null,
			costBasis: null
		},
		'Same Day Fund': {
			asOf: '2026-01-01 00:00:00.000Z',
			quantity: 1,
			price: 120,
			value: 120,
			costBasis: 100
		}
	});
});
