import { expect, test, type Page, type Route } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedUser,
	updateAccount,
	updateAsset
} from './pocketbase.helpers';

// Holds the first request matching `pattern`, runs `mutate` while it is in flight, then delivers the
// now-stale snapshot the server read before the mutation. This forces a realtime event to land inside
// the store's initial fetch window - the race that used to clobber the event with the older snapshot.
async function holdFirstFetch(page: Page, pattern: string, mutate: () => Promise<unknown>) {
	let intercepted = false;
	await page.route(pattern, async (route: Route) => {
		if (intercepted) return route.continue();
		intercepted = true;
		const response = await route.fetch();
		await mutate();
		// HACK: a buffered realtime event has no UI signal to wait on, so a bounded delay is the only
		// lever to guarantee the event reaches the browser before the stale snapshot resolves.
		await new Promise((resolve) => setTimeout(resolve, 750));
		await route.fulfill({ response });
	});
}

test('accounts store keeps a realtime rename that lands during the initial snapshot fetch', async ({
	page
}) => {
	const user = await seedUser('mira');
	const account = await seedAccount({
		name: 'Original Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/accounts/records**', () =>
		updateAccount(account.id, { name: 'Renamed Checking' })
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Original Checking' })).not.toBeVisible();

	await expect(page.getByRole('row', { name: 'Renamed Checking' })).toBeVisible();
});

test('accounts store keeps a realtime balance that lands during the initial snapshot fetch', async ({
	page
}) => {
	const user = await seedUser('noor');
	const account = await seedAccount({
		name: 'Everyday Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: '2025-01-01T00:00:00.000Z',
		value: 2500
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/accountBalances/records**', () =>
		seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 9999
		})
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	const row = page.getByRole('row', { name: 'Everyday Checking' });
	await expect(row).toBeVisible();
	await expect(row.locator('td').nth(6)).toContainText('$9,999.00');
});

test('accounts store keeps a realtime share that lands during the initial snapshot fetch', async ({
	page
}) => {
	const owner = await seedUser('opal');
	const recipient = await seedUser('quinn');
	const account = await seedAccount({
		name: 'Joint Savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: owner.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: account.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 4000
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/accountShares/records**', () =>
		seedAccountShare({
			account: account.id,
			recipient: recipient.id,
			recipientEmail: recipient.email,
			grantedBy: owner.id,
			accessRole: 'VIEWER',
			perspective: 'NORMAL',
			includeInNetWorth: true
		})
	);
	await signIn(page, owner.email);
	await goToPageViaSidebar(page, 'Accounts');

	const row = page.getByRole('row', { name: 'Joint Savings' });
	await expect(row).toBeVisible();
	await expect(row.getByLabel('Shared account')).toBeVisible();
});

test('assets store keeps a realtime rename that lands during the initial snapshot fetch', async ({
	page
}) => {
	const user = await seedUser('rune');
	const asset = await seedAsset({
		name: 'Vintage Watch',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Collectible'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 3000
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/assets/records**', () =>
		updateAsset(asset.id, { name: 'Rare Timepiece' })
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('row', { name: 'Vintage Watch' })).not.toBeVisible();

	await expect(page.getByRole('row', { name: 'Rare Timepiece' })).toBeVisible();
});

test('assets store keeps a realtime balance that lands during the initial snapshot fetch', async ({
	page
}) => {
	const user = await seedUser('sable');
	const asset = await seedAsset({
		name: 'Gold Bars',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Precious metals'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: '2025-01-01T00:00:00.000Z',
		marketValue: 3000
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/assetBalances/records**', () =>
		seedAssetBalance({
			asset: asset.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			marketValue: 8888
		})
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const row = page.getByRole('row', { name: 'Gold Bars' });
	await expect(row).toBeVisible();
	await expect(row.locator('td').nth(7)).toContainText('$8,888.00');
});

test('assets store keeps a realtime share that lands during the initial snapshot fetch', async ({
	page
}) => {
	const owner = await seedUser('tomas');
	const recipient = await seedUser('vera');
	const asset = await seedAsset({
		name: 'Family Cabin',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Property'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		marketValue: 250000
	});

	await page.goto('/');
	await holdFirstFetch(page, '**/api/collections/assetShares/records**', () =>
		seedAssetShare({
			asset: asset.id,
			recipient: recipient.id,
			recipientEmail: recipient.email,
			grantedBy: owner.id,
			accessRole: 'VIEWER',
			perspective: 'NORMAL',
			includeInNetWorth: true
		})
	);
	await signIn(page, owner.email);
	await goToPageViaSidebar(page, 'Assets');

	const row = page.getByRole('row', { name: 'Family Cabin' });
	await expect(row).toBeVisible();
	await expect(row.getByLabel('Shared asset')).toBeVisible();
});
