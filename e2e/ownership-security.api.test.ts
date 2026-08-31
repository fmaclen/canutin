import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import {
	getUserPB,
	pbSend,
	seedAccount,
	seedAsset,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

async function latestAccountBalance(email: string, accountId: string) {
	const pb = await getUserPB(email);
	const balances = await pb.collection('accountBalances').getList(1, 1, {
		filter: `account = "${accountId}"`,
		sort: '-asOf,-created'
	});
	return balances.items[0]?.value ?? null;
}

test('rejects foreign-parent writes and preserves owner balance', async () => {
	const alice = await seedUser('alice');
	const bob = await seedUser('bob');

	const aliceAccount = await seedAccount({
		name: 'Alice Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: alice.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});
	const aliceAsset = await seedAsset({
		name: 'Alice Collectible',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: alice.id,
		balanceType: 'Collectible'
	});

	await seedTransaction({
		account: aliceAccount.id,
		owner: alice.id,
		date: new Date().toISOString(),
		description: 'Opening deposit',
		value: 1000
	});
	await expect.poll(async () => latestAccountBalance(alice.email, aliceAccount.id)).toBe(1000);
	const balanceBeforeAttack = await latestAccountBalance(alice.email, aliceAccount.id);

	const foreignTransaction = await pbSend(
		'/api/collections/transactions/records',
		{
			owner: bob.id,
			account: aliceAccount.id,
			date: new Date().toISOString(),
			description: 'Injected debit',
			value: -999999
		},
		bob.email
	);
	expect(foreignTransaction.ok).toBe(false);
	expect(foreignTransaction.status).toBe(400);

	const foreignAccountBalance = await pbSend(
		'/api/collections/accountBalances/records',
		{
			owner: bob.id,
			account: aliceAccount.id,
			asOf: new Date().toISOString(),
			value: 500000
		},
		bob.email
	);
	expect(foreignAccountBalance.ok).toBe(false);
	expect(foreignAccountBalance.status).toBe(400);

	const foreignAssetBalance = await pbSend(
		'/api/collections/assetBalances/records',
		{
			owner: bob.id,
			asset: aliceAsset.id,
			asOf: new Date().toISOString(),
			bookValue: 500000,
			marketValue: 500000
		},
		bob.email
	);
	expect(foreignAssetBalance.ok).toBe(false);
	expect(foreignAssetBalance.status).toBe(400);

	expect(await latestAccountBalance(alice.email, aliceAccount.id)).toBe(balanceBeforeAttack);
});

test('rejects reparenting a transaction to a foreign account or changing its owner', async () => {
	const carol = await seedUser('carol');
	const dave = await seedUser('dave');

	const carolAccount = await seedAccount({
		name: 'Carol Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: carol.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});
	const daveAccount = await seedAccount({
		name: 'Dave Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: dave.id,
		balanceType: 'Checking'
	});

	const transaction = await seedTransaction({
		account: carolAccount.id,
		owner: carol.id,
		date: new Date().toISOString(),
		description: 'Paycheck',
		value: 2500
	});
	await expect.poll(async () => latestAccountBalance(carol.email, carolAccount.id)).toBe(2500);
	const balanceBeforeAttack = await latestAccountBalance(carol.email, carolAccount.id);

	const carolPB = await getUserPB(carol.email);
	const reparent = carolPB
		.collection('transactions')
		.update(transaction.id, { account: daveAccount.id });
	await expect(reparent).rejects.toMatchObject({ status: 404 });

	const changeOwner = carolPB.collection('transactions').update(transaction.id, { owner: dave.id });
	await expect(changeOwner).rejects.toMatchObject({ status: 403 });

	expect(await latestAccountBalance(carol.email, carolAccount.id)).toBe(balanceBeforeAttack);
});

test('owner can create a transaction on their own account', async () => {
	const erin = await seedUser('erin');

	const account = await seedAccount({
		name: 'Erin Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: erin.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});

	const response = await pbSend(
		'/api/collections/transactions/records',
		{
			owner: erin.id,
			account: account.id,
			date: new Date().toISOString(),
			description: 'Grocery run',
			value: -80
		},
		erin.email
	);
	expect(response.ok).toBe(true);
	await expect.poll(async () => latestAccountBalance(erin.email, account.id)).toBe(-80);
});
