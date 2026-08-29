import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { goToEditTab, goToPageViaSidebar, goToRecordDetail, signIn } from './playwright.helpers';
import {
	getUserPB,
	pbSend,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedCurrency,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('shared inverse account mirrors balances and transactions while allowing recipient-only net worth exclusion', async ({
	page
}) => {
	const owner = await seedUser('ursula');
	const recipient = await seedUser('victor');

	const payableAccount = await seedAccount({
		name: 'Partner payable',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: owner.id,
		balanceType: 'Payable'
	});

	await seedAccountBalance({
		account: payableAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: -1200
	});
	await seedTransaction({
		account: payableAccount.id,
		owner: owner.id,
		date: new Date().toISOString(),
		description: 'Repayment',
		value: -200
	});
	const share = await seedAccountShare({
		account: payableAccount.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});
	const recipientPB = await getUserPB(recipient.email);
	await expect(
		recipientPB.collection('accountShares').update(share.id, { perspective: 'NORMAL' })
	).rejects.toThrow();

	await page.goto('/');
	await signIn(page, recipient.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('$1,200');

	await goToPageViaSidebar(page, 'Accounts');
	const accountRow = page.getByRole('row', { name: /Partner payable/ });
	await expect(accountRow).toBeVisible();
	await expect(accountRow).toContainText('$1,200.00');

	await goToPageViaSidebar(page, 'Transactions');
	const transactionRow = page.getByRole('row', { name: /Repayment/ });
	await expect(transactionRow).toBeVisible();
	await expect(transactionRow.getByText('$200.00')).toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await accountRow.getByRole('link', { name: 'Partner payable' }).click();
	await goToEditTab(page);
	await expect(page.getByLabel('Include in net worth')).toBeChecked();

	await page.getByLabel('Include in net worth').uncheck();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Preferences updated')).toBeVisible();

	await goToPageViaSidebar(page, 'Big picture');
	await expect(netWorth).toContainText('$0');

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: /Partner payable/ })).toBeVisible();
});

test('shared inverse asset mirrors value fields while allowing recipient-only net worth exclusion', async ({
	page
}) => {
	const owner = await seedUser('wendy');
	const recipient = await seedUser('xavier');

	const receivableAsset = await seedAsset({
		name: 'Intercompany receivable',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Receivable'
	});

	await seedAssetBalance({
		asset: receivableAsset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 12000
	});
	await seedAssetShare({
		asset: receivableAsset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('-$12,000');

	await goToPageViaSidebar(page, 'Assets');
	const assetRow = page.getByRole('row', { name: /Intercompany receivable/ });
	await expect(assetRow).toBeVisible();
	const assetCells = assetRow.locator('td');
	await expect(assetCells.nth(4)).toContainText('-$9,000.00');
	await expect(assetCells.nth(7)).toContainText('-$12,000.00');

	await assetRow.getByRole('link', { name: 'Intercompany receivable' }).click();
	await goToEditTab(page);
	await expect(page.getByLabel('Include in net worth')).toBeChecked();

	await page.getByLabel('Include in net worth').uncheck();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Preferences updated')).toBeVisible();

	await goToPageViaSidebar(page, 'Big picture');
	await expect(netWorth).toContainText('$0');

	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('row', { name: /Intercompany receivable/ })).toBeVisible();
});

test('owner creates account share via UI and recipient sees it with NORMAL perspective', async ({
	page
}) => {
	const owner = await seedUser('alice');
	const recipient = await seedUser('bob');

	const jointAccount = await seedAccount({
		name: 'Joint savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Savings'
	});

	await seedAccountBalance({
		account: jointAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	await page.goto('/');
	await signIn(page, owner.email);

	await goToRecordDetail(page, 'Accounts', 'Joint savings');
	await goToEditTab(page);
	await page.getByLabel('Email').fill(recipient.email);
	// Leaving perspective untouched exercises its NORMAL default.
	await page.getByRole('button', { name: 'Share', exact: true }).click();

	await expect(page.getByText('Share created')).toBeVisible();
	await expect(page.getByText(recipient.email)).toBeVisible();
	await expect(page.getByText(/Normal perspective/)).toBeVisible();

	// Switch to recipient without touching the sign-out UI. PocketBase's auth
	// store is in localStorage, so cookies alone aren't enough.
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	await page.context().clearCookies();
	await page.goto('/');
	await signIn(page, recipient.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('$5,000');

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: /Joint savings/ })).toContainText('$5,000.00');
});

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

test('shared transaction detail page stays read-only for recipients', async ({ page }) => {
	const owner = await seedUser('kendra');
	const recipient = await seedUser('leo');

	const account = await seedAccount({
		name: 'Shared checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	const personalAccount = await seedAccount({
		name: 'Recipient checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: recipient.id,
		balanceType: 'Checking'
	});
	await seedTransaction({
		account: account.id,
		owner: owner.id,
		date: new Date().toISOString(),
		description: 'Shared transfer',
		value: 125
	});

	await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	await seedAccountBalance({
		account: personalAccount.id,
		owner: recipient.id,
		asOf: new Date().toISOString(),
		value: 250
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToRecordDetail(page, 'Transactions', 'Shared transfer');
	await expect(page.getByText('This shared transaction is read-only')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await expect(page.getByLabel('Description')).toBeDisabled();
	await expect(page.getByLabel('Amount')).toBeDisabled();
	await expect(page.getByLabel('Date')).toBeDisabled();
	await expect(page.getByLabel('Labels')).toBeDisabled();
	await expect(page.getByLabel('Account', { exact: true })).toBeDisabled();
	await expect(page.getByLabel('Excluded from totals')).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Recipient checking' })).toHaveCount(0);
});

test('shared account and asset detail views keep currency formatting for recipients', async ({
	page
}) => {
	const owner = await seedUser('maya');
	const recipient = await seedUser('nolan');

	const account = await seedAccount({
		name: 'Formatted liability',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: owner.id,
		balanceType: 'Payable'
	});
	const asset = await seedAsset({
		name: 'Formatted receivable',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Receivable'
	});

	await seedAccountBalance({
		account: account.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: -1200
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 12000
	});
	await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});
	await seedAssetShare({
		asset: asset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToRecordDetail(page, 'Accounts', 'Formatted liability');
	await goToEditTab(page);
	await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('$1,200.00');

	await goToRecordDetail(page, 'Assets', 'Formatted receivable');
	await goToEditTab(page);
	// Assets Overview also has a "Market value" summary stat with the same exact label as this
	// Edit-page input, so wait for the URL to confirm the SPA transition landed before asserting -
	// otherwise a still-in-flight navigation can resolve the Overview stat instead of the input.
	await expect(page).toHaveURL(/\/assets\/.+\/edit/);
	await expect(page.getByLabel('Market value', { exact: true })).toHaveValue('-$12,000.00');
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

test('recipient can leave a shared account via UI', async ({ page }) => {
	const owner = await seedUser('olivia');
	const recipient = await seedUser('peter');

	const account = await seedAccount({
		name: 'Leavable savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: account.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: owner.id,
		date: new Date().toISOString(),
		description: 'Leavable bill',
		value: -45
	});
	await seedAccountShare({
		account: account.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToPageViaSidebar(page, 'Accounts');
	const accountRow = page.getByRole('row', { name: /Leavable savings/ });
	await expect(accountRow).toBeVisible();

	await accountRow.getByRole('link', { name: 'Leavable savings' }).click();
	await goToEditTab(page);
	await page.getByRole('button', { name: 'Leave' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page).toHaveURL(/\/accounts$/);
	await expect(page.getByRole('row', { name: /Leavable savings/ })).toHaveCount(0);

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: /Leavable bill/ })).toHaveCount(0);
});

test('recipient can leave a shared asset via UI', async ({ page }) => {
	const owner = await seedUser('quincy');
	const recipient = await seedUser('rita');

	const asset = await seedAsset({
		name: 'Leavable brokerage',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: owner.id,
		balanceType: 'Brokerage'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 12000
	});
	await seedAssetShare({
		asset: asset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToPageViaSidebar(page, 'Assets');
	const assetRow = page.getByRole('row', { name: /Leavable brokerage/ });
	await expect(assetRow).toBeVisible();

	await assetRow.getByRole('link', { name: 'Leavable brokerage' }).click();
	await goToEditTab(page);
	await page.getByRole('button', { name: 'Leave' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page).toHaveURL(/\/assets$/);
	await expect(page.getByRole('row', { name: /Leavable brokerage/ })).toHaveCount(0);
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

test('shared account and asset reconcile after a realtime reconnect without relogin', async ({
	page
}) => {
	const owner = await seedUser('dexter');
	const recipient = await seedUser('gwen');

	const sharedAccount = await seedAccount({
		name: 'Reconnect savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: sharedAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 4200
	});
	const sharedAsset = await seedAsset({
		name: 'Reconnect brokerage',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: owner.id,
		balanceType: 'Brokerage'
	});
	await seedAssetBalance({
		asset: sharedAsset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		bookValue: 8000,
		marketValue: 11000
	});

	// Track the SDK's realtime EventSource so the test can dispatch a transport error on it. This
	// covers the SDK's own reconnect path - onDisconnect, then PB_CONNECT - and only that path: a
	// real network drop usually leaves the socket OPEN without ever erroring, which is why the
	// offline test below drives the browser's online/visibility triggers instead.
	await page.addInitScript(() => {
		const NativeEventSource = window.EventSource;
		const sources: EventSource[] = [];
		Object.assign(window, { __realtimeSources: sources });
		window.EventSource = class extends NativeEventSource {
			constructor(url: string | URL, init?: EventSourceInit) {
				super(url, init);
				sources.push(this);
			}
		};
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: /Reconnect savings/ })).toHaveCount(0);

	// Hold the realtime connection down while both records are shared, so the create events are
	// never delivered to this session. Gating the reconnect (rather than aborting it) keeps the SDK
	// from backing off, so releasing the gate reconnects promptly.
	let releaseRealtime = () => {};
	const realtimeGate = new Promise<void>((resolve) => {
		releaseRealtime = resolve;
	});
	await page.route('**/api/realtime', async (route) => {
		await realtimeGate;
		await route.continue();
	});
	await page.evaluate(() => {
		const sources = (window as unknown as { __realtimeSources: EventSource[] }).__realtimeSources;
		for (const source of sources) source.dispatchEvent(new Event('error'));
	});
	await Promise.all([
		seedAccountShare({
			account: sharedAccount.id,
			recipient: recipient.id,
			recipientEmail: recipient.email,
			grantedBy: owner.id,
			accessRole: 'VIEWER',
			perspective: 'NORMAL',
			includeInNetWorth: true
		}),
		seedAssetShare({
			asset: sharedAsset.id,
			recipient: recipient.id,
			recipientEmail: recipient.email,
			grantedBy: owner.id,
			accessRole: 'VIEWER',
			perspective: 'NORMAL',
			includeInNetWorth: true
		})
	]);
	releaseRealtime();

	// HACK: reconnect reconciliation refetches shares, accounts, and each account's balance in
	// sequence, which can outrun the default expect timeout under a loaded CI machine; there is no
	// reconcile-complete signal to await instead.
	await expect(page.getByRole('row', { name: /Reconnect savings/ })).toContainText('$4,200.00', {
		timeout: 15000
	});

	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('row', { name: /Reconnect brokerage/ })).toBeVisible();
});

test('shared account reconciles after the browser goes offline and back online', async ({
	browserName,
	page
}) => {
	// Only CDP reproduces a real network drop. `context.setOffline()` tears the realtime EventSource
	// down, so the SDK sees a transport error and reconnects on its own; an actual offline network -
	// what DevTools' offline mode emulates - leaves the socket OPEN and silent instead.
	test.skip(browserName !== 'chromium', 'Network emulation is only available through CDP');
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Network.enable');
	const emulateOffline = (offline: boolean) =>
		cdp.send('Network.emulateNetworkConditions', {
			offline,
			latency: 0,
			downloadThroughput: -1,
			uploadThroughput: -1
		});

	const owner = await seedUser('felix');
	const recipient = await seedUser('lucia');

	const sharedAccount = await seedAccount({
		name: 'Offline checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: sharedAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 1500
	});
	await seedAccountShare({
		account: sharedAccount.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	const lateAccount = await seedAccount({
		name: 'Offline savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: lateAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 900
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	await goToPageViaSidebar(page, 'Accounts');
	const checkingRow = page.getByRole('row', { name: /Offline checking/ });
	await expect(checkingRow).toContainText('$1,500.00');

	// A real network drop leaves the realtime socket OPEN and error-free, so the SDK never notices it
	// and never reconnects. The socket even keeps delivering events - but the refetch each one
	// schedules dies on the dead network and its result is discarded, which is what the connection
	// toast reports. Waiting for that toast is what makes this test meaningful: it proves the missed
	// mutations have already been consumed and thrown away before the network returns, so nothing but
	// recovery can converge the session afterwards.
	await emulateOffline(true);
	await seedAccountBalance({
		account: sharedAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 4200
	});
	await seedAccountShare({
		account: lateAccount.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	await expect(page.getByText("Can't connect to the database server")).toBeVisible();
	await expect(checkingRow).toContainText('$1,500.00');
	await expect(page.getByRole('row', { name: /Offline savings/ })).toHaveCount(0);

	// Coming back online must reconcile the session on its own: no reload, no further realtime event.
	await emulateOffline(false);
	await expect(checkingRow).toContainText('$4,200.00');
	await expect(page.getByRole('row', { name: /Offline savings/ })).toContainText('$900.00');
});
