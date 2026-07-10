import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import { getUserPB, pbSend, seedAccount, seedSecurity, seedUser } from './pocketbase.helpers';

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
