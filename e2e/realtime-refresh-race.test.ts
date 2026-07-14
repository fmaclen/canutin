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

// Holds the store's first fetch matching `pattern`, runs `mutate` while it is in flight, then releases
// the now-stale snapshot the server read before the mutation. The mutation fires a realtime event that
// schedules a debounced refetch reading the post-mutation state.
//
// These tests assert CONVERGENCE, not the latest-wins token guard. The intercepted first fetch belongs
// to the (app)-layout store instance that mounts right after sign-in redirects to /big-picture;
// `goToPageViaSidebar` then does a full `page.goto()` reload (and the root `{#key locale}` block re-keys
// on async locale resolution), so that document - and its held request - is discarded before the delayed
// fulfill lands. The freshly loaded page mounts a new store instance that issues its own initial fetch
// reading post-mutation state. The stale snapshot never commits into the rendered store: it dies with
// its document, not via a token comparison, so a broken guard is not observable here. The `settled`
// promise and the post-`settled` re-assertions anchor that the store lands on and holds the
// post-mutation state through the release - convergence - rather than probing the guard, which this
// mechanism cannot exercise (that needs a two-token race within one live store instance).
async function holdFirstFetch(page: Page, pattern: string, mutate: () => Promise<unknown>) {
	let resolveSettled!: () => void;
	const settled = new Promise<void>((resolve) => {
		resolveSettled = resolve;
	});
	let intercepted = false;
	await page.route(pattern, async (route: Route) => {
		if (intercepted) return route.continue();
		intercepted = true;
		const response = await route.fetch();
		await mutate();
		// HACK: the event-triggered follow-up refetch has no UI signal to wait on, so a bounded delay
		// is the only lever to let the reloaded page's fetch commit before the stale first fetch resolves.
		await new Promise((resolve) => setTimeout(resolve, 750));
		try {
			await route.fulfill({ response });
			// HACK: releasing the stale snapshot has no UI signal to wait on either. Hop a frame plus a
			// macrotask in the page so any effect of the release has quiesced before `settled` resolves -
			// same spirit as the delay above, kept harness-internal rather than a waitForTimeout at the
			// assertion level.
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
			);
		} catch {
			// HACK: `goToPageViaSidebar` does a full page.goto that discards this document (and its held
			// request) before the delayed fulfill lands, so on a slow machine the fulfill or the quiesce
			// hop can race the teardown and throw "Execution context was destroyed"/"Request is already
			// handled". The release is best-effort - the stale snapshot dies with its document regardless -
			// so swallow the teardown error and still resolve `settled` below so the test can't hang.
		}
		resolveSettled();
	});
	return { settled };
}

// Probes the latest-wins token guard within ONE live store instance, so a stale commit is observable
// (unlike holdFirstFetch, which reloads the page and discards the held request with its document before
// it can commit). Installed AFTER the store's initial fetch has rendered: the first intercepted refetch
// is R1 (older token), captured post-mutation-1 and held in flight; the second is R2 (newer token),
// let through so it reads post-mutation-2 state and commits. Releasing the now-stale R1 must be dropped
// by the guard. `r1Dispatched` fires once R1's body is captured (so mutation 2 lands strictly after,
// keeping the two debounce windows from coalescing); `r2Seen` fires once R2 reaches the network.
async function holdRefetchForTokenRace(page: Page, pattern: string) {
	let resolveR1Dispatched!: () => void;
	const r1Dispatched = new Promise<void>((resolve) => (resolveR1Dispatched = resolve));
	let resolveR2Seen!: () => void;
	const r2Seen = new Promise<void>((resolve) => (resolveR2Seen = resolve));
	let releaseR1!: () => void;
	const r1Released = new Promise<void>((resolve) => (releaseR1 = resolve));
	let resolveSettled!: () => void;
	const settled = new Promise<void>((resolve) => (resolveSettled = resolve));

	let matchCount = 0;
	await page.route(pattern, async (route: Route) => {
		matchCount++;
		if (matchCount === 1) {
			const response = await route.fetch();
			resolveR1Dispatched();
			await r1Released;
			await route.fulfill({ response });
			// HACK: releasing the stale snapshot has no UI signal to wait on, so hop a frame plus a
			// macrotask in the page so any (broken-guard) commit of the stale response has flushed to the
			// DOM before `settled` resolves - kept harness-internal rather than a waitForTimeout at the
			// assertion level.
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
			);
			resolveSettled();
			return;
		}
		if (matchCount === 2) resolveR2Seen();
		return route.continue();
	});
	return { r1Dispatched, r2Seen, releaseR1, settled };
}

test('accounts store discards a stale realtime refetch resolving under an older token', async ({
	page
}) => {
	const user = await seedUser('zephyr');
	const account = await seedAccount({
		name: 'Starting Checking',
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
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	// The store instance is alive from here on - no further navigation or reload - so a stale refetch that
	// commits would corrupt the rendered store rather than dying with a discarded document.
	await expect(page.getByRole('row', { name: 'Starting Checking' })).toBeVisible();

	const { r1Dispatched, r2Seen, releaseR1, settled } = await holdRefetchForTokenRace(
		page,
		'**/api/collections/accounts/records**'
	);

	// Mutation 1 -> realtime event -> debounced refetch R1 (older token) reads 'First Rename' and is held
	// in flight before it can commit.
	await updateAccount(account.id, { name: 'First Rename' });
	await r1Dispatched;

	// Mutation 2 while R1 is held -> refetch R2 (newer token) reads 'Final Name', passes through and
	// commits. Awaiting the rendered rename proves R2 landed before the stale R1 is released.
	await updateAccount(account.id, { name: 'Final Name' });
	await r2Seen;
	await expect(page.getByRole('row', { name: 'Final Name' })).toBeVisible();

	// Releasing the stale R1: the guard drops it because its token is no longer current, so the UI keeps
	// 'Final Name'. A broken guard would commit 'First Rename' here, and with no further realtime events
	// nothing would ever re-correct it.
	releaseR1();
	await settled;
	await expect(page.getByRole('row', { name: 'Final Name' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'First Rename' })).toHaveCount(0);
});

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
	const { settled } = await holdFirstFetch(page, '**/api/collections/accounts/records**', () =>
		updateAccount(account.id, { name: 'Renamed Checking' })
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Original Checking' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Renamed Checking' })).toBeVisible();

	// After the held pre-rename snapshot is released, the store must still show the realtime rename: it
	// converged on the post-mutation state during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(
		page,
		'**/api/collections/accountBalances/records**',
		() =>
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

	// After the held pre-update snapshot is released, the new balance must still be rendered: the store
	// converged on the post-mutation value during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(page, '**/api/collections/accountShares/records**', () =>
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

	// After the held pre-share snapshot is released, the shared badge must still be rendered: the store
	// converged on the post-share state during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(page, '**/api/collections/assets/records**', () =>
		updateAsset(asset.id, { name: 'Rare Timepiece' })
	);
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('row', { name: 'Vintage Watch' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Rare Timepiece' })).toBeVisible();

	// After the held pre-rename snapshot is released, the store must still show the realtime rename: it
	// converged on the post-mutation state during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(page, '**/api/collections/assetBalances/records**', () =>
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

	// After the held pre-update snapshot is released, the new balance must still be rendered: the store
	// converged on the post-mutation value during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(page, '**/api/collections/assetShares/records**', () =>
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

	// After the held pre-share snapshot is released, the shared badge must still be rendered: the store
	// converged on the post-share state during load and holds it through the stale release.
	await settled;
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
	const { settled } = await holdFirstFetch(
		page,
		'**/api/collections/securities/records**',
		async () => {
			const userPb = await getUserPB(user.email);
			await userPb.collection('securities').delete(doomed.id);
		}
	);
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

	// After the held pre-delete snapshot is released, the positions total must reflect only the surviving
	// holding ($777.00). The per-row $777.00 above survives in both states, but the net market value total
	// discriminates: it confirms the store converged on the post-delete snapshot (total $777.00, not
	// $1,277.00) during load and holds it through the stale release.
	await settled;
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$777.00');
});
