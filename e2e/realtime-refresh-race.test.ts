import { expect, test, type Page, type Route } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedPortfolio,
	seedUser,
	updateAccount,
	updateAsset
} from './pocketbase.helpers';

// Holds the store's first fetch matching `pattern`, runs `mutate` while it is in flight, then
// releases the now-stale snapshot the server read before the mutation. Under the invalidation-only
// model the mutation fires a realtime event that schedules a debounced follow-up refetch, which reads
// the post-mutation state and commits under a newer request token. The held first fetch then resolves
// with pre-mutation data under its older token and is discarded by the latest-wins guard, so the
// mutation is the state that survives.
async function holdFirstFetch(page: Page, pattern: string, mutate: () => Promise<unknown>) {
	let intercepted = false;
	await page.route(pattern, async (route: Route) => {
		if (intercepted) return route.continue();
		intercepted = true;
		const response = await route.fetch();
		await mutate();
		// HACK: the event-triggered follow-up refetch has no UI signal to wait on, so a bounded delay
		// is the only lever to let it commit before the stale first fetch resolves.
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

test('securities store keeps a security delete that lands during the initial snapshot fetch removed', async ({
	page
}) => {
	const user = await seedUser('wynn');
	const {
		securities: [doomed]
	} = await seedPortfolio(user.id, {
		accounts: ['Wynn Brokerage'],
		securities: [
			{ name: 'Doomed Holding', symbol: 'DOOM' },
			{ name: 'Steady Holding', symbol: 'STDY' }
		],
		balances: [
			{
				account: 'Wynn Brokerage',
				security: 'Doomed Holding',
				quantity: 5,
				price: 100,
				value: 500,
				costBasis: 400
			},
			{
				account: 'Wynn Brokerage',
				security: 'Steady Holding',
				quantity: 3,
				price: 259,
				value: 777,
				costBasis: 600
			}
		],
		asOf: new Date().toISOString()
	});

	await page.goto('/');
	// Deleting the security cascades to its securityBalances server-side and fires a realtime event
	// that lands while the store's initial securities snapshot is still held in flight. That event
	// schedules a fresh full refetch (which reads the post-delete state), while the held pre-delete
	// snapshot resolves later under an older token and is discarded by the latest-wins guard.
	await holdFirstFetch(page, '**/api/collections/securities/records**', async () => {
		const userPb = await getUserPB(user.email);
		await userPb.collection('securities').delete(doomed.id);
	});
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');

	// Anchor on the surviving position first: its row (and intact balance) proves the store committed a
	// real post-delete snapshot, so the absence check below runs against rendered data rather than an
	// unloaded skeleton - otherwise a leading absence assertion would pass trivially before any commit.
	const survivingRow = page.getByRole('row', { name: /Steady Holding/ });
	await expect(survivingRow).toContainText('STDY');
	await expect(survivingRow.locator('td').last()).toHaveText('$777.00');

	// The deleted security and its cascaded balances stay gone: the stale in-flight snapshot never
	// resurrects them once the latest-wins token discards it.
	await expect(page.getByRole('row', { name: /Doomed Holding/ })).toHaveCount(0);
});
