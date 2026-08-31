import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import {
	getUserPB,
	pbSend,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetShare,
	seedCurrency,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('account share API adds the parent currency to the recipient registry', async () => {
	const owner = await seedUser('marina');
	const recipient = await seedUser('nestor');

	await seedCurrency({ owner: owner.id, code: 'ARS', name: 'Argentine peso', autoUpdate: false });
	const account = await seedAccount({
		name: 'Peso checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking',
		currency: 'ARS'
	});

	const recipientPB = await getUserPB(recipient.email);
	await expect(
		recipientPB.collection('currencies').getFirstListItem("code='ARS'")
	).rejects.toThrow();

	const response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, recipientEmail: recipient.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(200);

	const currency = await recipientPB.collection('currencies').getFirstListItem("code='ARS'");
	expect(currency.code).toBe('ARS');
	expect(currency.autoUpdate).toBe(true);
});

test('sharer cannot mutate an existing account share after creation', async () => {
	const owner = await seedUser('georgia');
	const recipient = await seedUser('harold');

	const account = await seedAccount({
		name: 'Immutable account share',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});

	const share = await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const ownerPB = await getUserPB(owner.email);
	await expect(
		ownerPB.collection('accountShares').update(share.id, { perspective: 'INVERSE' })
	).rejects.toThrow();
});

test('sharer cannot mutate an existing asset share after creation', async () => {
	const owner = await seedUser('isla');
	const recipient = await seedUser('jordan');

	const asset = await seedAsset({
		name: 'Immutable asset share',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Collectible'
	});

	const share = await seedAssetShare({
		asset: asset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const ownerPB = await getUserPB(owner.email);
	await expect(
		ownerPB.collection('assetShares').update(share.id, { perspective: 'INVERSE' })
	).rejects.toThrow();
});

test('account share API rejects self-share, unknown recipient, duplicates, and missing fields', async () => {
	const owner = await seedUser('carol');
	const recipient = await seedUser('dave');

	const account = await seedAccount({
		name: 'API test account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});

	// Missing recipient email
	let response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(400);

	// Missing account id
	response = await pbSend(
		'/api/shares/accounts',
		{ recipientEmail: recipient.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(400);

	// Invalid perspective
	response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, recipientEmail: recipient.email, perspective: 'SIDEWAYS' },
		owner.email
	);
	expect(response.status).toBe(400);

	// Self-share
	response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, recipientEmail: owner.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(400);

	// Unknown recipient
	response = await pbSend(
		'/api/shares/accounts',
		{
			accountId: account.id,
			recipientEmail: 'nobody.nope@example.com',
			perspective: 'NORMAL'
		},
		owner.email
	);
	expect(response.status).toBe(404);

	// Unauthenticated
	response = await pbSend('/api/shares/accounts', {
		accountId: account.id,
		recipientEmail: recipient.email,
		perspective: 'NORMAL'
	});
	expect(response.status).toBe(401);

	// Valid share succeeds
	response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, recipientEmail: recipient.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(200);

	// Duplicate share rejected
	response = await pbSend(
		'/api/shares/accounts',
		{ accountId: account.id, recipientEmail: recipient.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(400);
});

test('recipient can delete their own account share via API', async () => {
	const owner = await seedUser('sam');
	const recipient = await seedUser('tina');

	const account = await seedAccount({
		name: 'Recipient-delete account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	const share = await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const recipientPB = await getUserPB(recipient.email);
	await recipientPB.collection('accountShares').delete(share.id);

	await expect(recipientPB.collection('accountShares').getOne(share.id)).rejects.toThrow();
});

test('recipient can delete their own asset share via API', async () => {
	const owner = await seedUser('ulysses');
	const recipient = await seedUser('vera');

	const asset = await seedAsset({
		name: 'Recipient-delete asset',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Collectible'
	});
	const share = await seedAssetShare({
		asset: asset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const recipientPB = await getUserPB(recipient.email);
	await recipientPB.collection('assetShares').delete(share.id);

	await expect(recipientPB.collection('assetShares').getOne(share.id)).rejects.toThrow();
});

test('owner can still revoke a share after delete rule change', async () => {
	const owner = await seedUser('walt');
	const recipient = await seedUser('xena');

	const account = await seedAccount({
		name: 'Owner-revoke account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	const share = await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const ownerPB = await getUserPB(owner.email);
	await ownerPB.collection('accountShares').delete(share.id);

	await expect(ownerPB.collection('accountShares').getOne(share.id)).rejects.toThrow();
});

test("a third user cannot delete someone else's share", async () => {
	const owner = await seedUser('yuri');
	const recipient = await seedUser('zoe');
	const outsider = await seedUser('aaron');

	const account = await seedAccount({
		name: 'Guarded share',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	const share = await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const outsiderPB = await getUserPB(outsider.email);
	await expect(outsiderPB.collection('accountShares').delete(share.id)).rejects.toThrow();
});

test('leaving a share leaves owner data intact', async () => {
	const owner = await seedUser('brenda');
	const recipient = await seedUser('colin');

	const account = await seedAccount({
		name: 'Owner-retained account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 7500
	});
	const transaction = await seedTransaction({
		account: account.id,
		owner: owner.id,
		date: new Date().toISOString(),
		description: 'Owner-retained transfer',
		value: 100
	});
	const share = await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	const recipientPB = await getUserPB(recipient.email);
	await recipientPB.collection('accountShares').delete(share.id);

	const ownerPB = await getUserPB(owner.email);
	const ownerAccount = await ownerPB.collection('accounts').getOne(account.id);
	expect(ownerAccount.name).toBe('Owner-retained account');

	const ownerTransaction = await ownerPB.collection('transactions').getOne(transaction.id);
	expect(ownerTransaction.description).toBe('Owner-retained transfer');

	await expect(recipientPB.collection('accounts').getOne(account.id)).rejects.toThrow();
});

test('asset share API rejects self-share and unknown recipient', async () => {
	const owner = await seedUser('erin');
	const recipient = await seedUser('frank');

	const asset = await seedAsset({
		name: 'API test asset',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Collectible'
	});

	// Self-share
	let response = await pbSend(
		'/api/shares/assets',
		{ assetId: asset.id, recipientEmail: owner.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(400);

	// Unknown recipient
	response = await pbSend(
		'/api/shares/assets',
		{
			assetId: asset.id,
			recipientEmail: 'ghost@example.com',
			perspective: 'NORMAL'
		},
		owner.email
	);
	expect(response.status).toBe(404);

	// Valid share succeeds
	response = await pbSend(
		'/api/shares/assets',
		{ assetId: asset.id, recipientEmail: recipient.email, perspective: 'NORMAL' },
		owner.email
	);
	expect(response.status).toBe(200);
});
