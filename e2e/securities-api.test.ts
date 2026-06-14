import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getUserPB, pbSend, seedAccount, seedUser } from './pocketbase.helpers';

const PATH = '/api/canutin/securities/with-initial-balance';

function buildBody(ownerId: string, accountId: string) {
	return {
		security: { name: 'API Fund', symbol: 'APIF', owner: ownerId },
		balance: {
			account: accountId,
			owner: ownerId,
			asOf: '2026-01-01 00:00:00.000Z',
			quantity: 1,
			price: null,
			value: null,
			costBasis: null
		}
	};
}

test('with-initial-balance rejects owner mismatch', async () => {
	const alice = await seedUser('hazel');
	const bob = await seedUser('rowan');
	const account = await seedAccount({
		name: 'Owner Mismatch Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: bob.id,
		balanceType: 'Brokerage'
	});

	const response = await pbSend(PATH, buildBody(bob.id, account.id), alice.email);
	expect(response.status).toBe(403);
	const payload = await response.json();
	expect(payload.message).toContain('Owner must match');
});

test('with-initial-balance rejects a foreign account', async () => {
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

test('with-initial-balance rejects a closed account and persists nothing', async () => {
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
	expect(await pb.collection('securityBalances').getFullList()).toHaveLength(0);
});

test('with-initial-balance rejects an unauthenticated request', async () => {
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
