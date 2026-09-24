import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import {
	getAdminPB,
	getUserPB,
	PB_URL,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedSecurity,
	seedSecurityBalance,
	seedTrade,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

test('anonymous and expired sessions cannot list or view unshared financial records', async () => {
	const sylvie = await seedUser('sylvie');
	const maurice = await seedUser('maurice');
	const date = new Date().toISOString();
	const owned = await seedAccount({
		name: 'Personal brokerage',
		owner: sylvie.id,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage'
	});
	const accountBalance = await seedAccountBalance({
		account: owned.id,
		owner: sylvie.id,
		asOf: date,
		value: 1025
	});
	const asset = await seedAsset({
		name: 'Personal artwork',
		owner: sylvie.id,
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Artwork'
	});
	const assetBalance = await seedAssetBalance({
		asset: asset.id,
		owner: sylvie.id,
		asOf: date,
		marketValue: 4000
	});
	const security = await seedSecurity({ name: 'Private holding', owner: sylvie.id });
	const securityBalance = await seedSecurityBalance({
		account: owned.id,
		security: security.id,
		owner: sylvie.id,
		asOf: date,
		quantity: 2,
		price: 100,
		value: 200
	});
	const trade = await seedTrade({
		account: owned.id,
		security: security.id,
		owner: sylvie.id,
		date,
		type: SecurityTransactionsTypeOptions.buy,
		description: 'Purchase',
		quantity: 2,
		price: 100,
		amount: 200
	});
	const label = await seedTransactionLabel({ name: 'Personal income', owner: sylvie.id });
	const transaction = await seedTransaction({
		account: owned.id,
		owner: sylvie.id,
		date,
		description: 'Deposit',
		value: 1025,
		labels: [label.id]
	});
	const shared = await seedAccount({
		name: 'Shared savings',
		owner: maurice.id,
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Savings'
	});
	await seedAccountShare({
		account: shared.id,
		recipient: sylvie.id,
		recipientEmail: sylvie.email,
		grantedBy: maurice.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	const filter = `owner='${sylvie.id}' || accountShares_via_account.recipient ?= '${sylvie.id}'`;
	const authenticated = await getUserPB(sylvie.email);
	const before = await authenticated.collection('accounts').getFullList({ filter });
	expect(before.map((account) => account.id).sort()).toEqual([owned.id, shared.id].sort());

	// Use a server-signed token with real expiry; collection-wide token settings stay unchanged.
	const admin = await getAdminPB();
	const expired = await admin.collection('users').impersonate(sylvie.id, 1);
	await expect.poll(() => expired.authStore.isValid).toBe(false);
	await expect(expired.collection('users').authRefresh()).rejects.toMatchObject({ status: 401 });
	const anonymous = new PocketBase(PB_URL);
	const unauthenticatedClients = [
		['anonymous', anonymous],
		['expired', expired]
	] as const;
	for (const [session, client] of unauthenticatedClients) {
		const accounts = await client.collection('accounts').getFullList({ filter });
		expect(accounts, `${session} account filter`).toEqual([]);
	}

	const records = [
		['accounts', owned.id],
		['accountBalances', accountBalance.id],
		['latestAccountBalances', accountBalance.id],
		['assets', asset.id],
		['assetBalances', assetBalance.id],
		['latestAssetBalances', assetBalance.id],
		['balanceTypes', owned.balanceType],
		['securities', security.id],
		['securityBalances', securityBalance.id],
		['latestSecurityBalances', securityBalance.id],
		['securityTransactions', trade.id],
		['transactionLabels', label.id],
		['transactions', transaction.id]
	] as const;
	for (const [collection, id] of records) {
		await test.step(collection, async () => {
			const ownedRecords = await authenticated.collection(collection).getFullList({
				filter: `id='${id}'`
			});
			expect(ownedRecords.map((record) => record.id)).toEqual([id]);
			await expect(authenticated.collection(collection).getOne(id)).resolves.toMatchObject({ id });

			for (const [session, client] of unauthenticatedClients) {
				const visibleRecords = await client.collection(collection).getFullList({
					filter: `id='${id}'`
				});
				expect(visibleRecords, `${session} list`).toEqual([]);
				await expect(
					client.collection(collection).getOne(id),
					`${session} view`
				).rejects.toMatchObject({
					status: 404
				});
			}
		});
	}
});

test('latest balance views show share recipients only the shared records and strangers nothing', async () => {
	const blanche = await seedUser('blanche');
	const cosmo = await seedUser('cosmo');
	const delphine = await seedUser('delphine');
	const sharedAccount = await seedAccount({
		name: 'Shared brokerage',
		owner: blanche.id,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage'
	});
	const privateAccount = await seedAccount({
		name: 'Private brokerage',
		owner: blanche.id,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage'
	});
	const sharedAsset = await seedAsset({
		name: 'Shared cabin',
		owner: blanche.id,
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Real estate'
	});
	const privateAsset = await seedAsset({
		name: 'Private cabin',
		owner: blanche.id,
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Real estate'
	});
	const security = await seedSecurity({ name: 'Shared holding', owner: blanche.id });
	await seedAccountShare({
		account: sharedAccount.id,
		recipient: cosmo.id,
		recipientEmail: cosmo.email,
		grantedBy: blanche.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	await seedAssetShare({
		asset: sharedAsset.id,
		recipient: cosmo.id,
		recipientEmail: cosmo.email,
		grantedBy: blanche.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	// Each shared record gets an older and a newer balance so only the newest may come through; each
	// private record gets one balance that must stay hidden.
	const accountBalances = [];
	const assetBalances = [];
	const securityBalances = [];
	for (const asOf of ['2026-01-01 00:00:00.000Z', '2026-02-01 00:00:00.000Z']) {
		accountBalances.push(
			await seedAccountBalance({ account: sharedAccount.id, owner: blanche.id, asOf, value: 100 })
		);
		assetBalances.push(
			await seedAssetBalance({ asset: sharedAsset.id, owner: blanche.id, asOf, marketValue: 100 })
		);
		securityBalances.push(
			await seedSecurityBalance({
				account: sharedAccount.id,
				security: security.id,
				owner: blanche.id,
				asOf,
				quantity: 1,
				price: 100,
				value: 100
			})
		);
	}
	const privateAccountBalance = await seedAccountBalance({
		account: privateAccount.id,
		owner: blanche.id,
		asOf: '2026-02-01 00:00:00.000Z',
		value: 300
	});
	await seedAssetBalance({
		asset: privateAsset.id,
		owner: blanche.id,
		asOf: '2026-02-01 00:00:00.000Z',
		marketValue: 300
	});
	await seedSecurityBalance({
		account: privateAccount.id,
		security: security.id,
		owner: blanche.id,
		asOf: '2026-02-01 00:00:00.000Z',
		quantity: 3,
		price: 100,
		value: 300
	});

	const recipient = await getUserPB(cosmo.email);
	const recipientAccountBalances = await recipient
		.collection('latestAccountBalances')
		.getFullList();
	expect(recipientAccountBalances.map((balance) => balance.id)).toEqual([accountBalances[1].id]);
	const recipientAssetBalances = await recipient.collection('latestAssetBalances').getFullList();
	expect(recipientAssetBalances.map((balance) => balance.id)).toEqual([assetBalances[1].id]);
	const recipientSecurityBalances = await recipient
		.collection('latestSecurityBalances')
		.getFullList();
	expect(recipientSecurityBalances.map((balance) => balance.id)).toEqual([securityBalances[1].id]);
	await expect(
		recipient.collection('latestAccountBalances').getOne(privateAccountBalance.id)
	).rejects.toMatchObject({ status: 404 });

	const stranger = await getUserPB(delphine.email);
	for (const collection of [
		'latestAccountBalances',
		'latestAssetBalances',
		'latestSecurityBalances'
	] as const) {
		expect(await stranger.collection(collection).getFullList(), collection).toEqual([]);
	}
});
