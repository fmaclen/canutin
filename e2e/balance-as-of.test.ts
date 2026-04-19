import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions,
	AssetsTypeOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedUser
} from './pocketbase.helpers';

// Fixed reference date so the rendered "As of" label is deterministic.
const REFERENCE_ASOF = '2025-03-15T12:00:00.000Z';

test('account detail page shows "As of <date>" next to the Balance label', async ({ page }) => {
	const user = await seedUser('jasper');

	const account = await seedAccount({
		name: 'As Of Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: REFERENCE_ASOF,
		value: 2510
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/accounts/${account.id}`);

	const asOf = page.getByTestId('balance-as-of').first();
	await expect(asOf).toBeVisible();
	await expect(asOf).toHaveText(/^As of /);

	const time = asOf.locator('time');
	await expect(time).toBeVisible();
	await expect(time).toHaveAttribute('datetime', REFERENCE_ASOF);
	await expect(time).toHaveAttribute('title', /.+/);
	await expect(time).toHaveClass(/cursor-help/);
	await expect(time).toHaveClass(/border-dashed/);
	await expect(time).toHaveClass(/border-b/);
	await expect(time).toContainText('Mar');
	await expect(time).toContainText('2025');
	// Day can render as 14 or 15 depending on the runner's timezone.
	await expect(time).toHaveText(/\b(14|15)\b/);
});

test('asset detail page (WHOLE) shows "As of <date>" next to the Market value label', async ({
	page
}) => {
	const user = await seedUser('kendra');

	const asset = await seedAsset({
		name: 'As Of Collectible',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Collectibles',
		type: AssetsTypeOptions.WHOLE
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: REFERENCE_ASOF,
		bookValue: 5000,
		marketValue: 5500
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/assets/${asset.id}`);

	const asOf = page.getByTestId('balance-as-of').first();
	await expect(asOf).toBeVisible();
	await expect(asOf).toHaveText(/^As of /);

	const time = asOf.locator('time');
	await expect(time).toBeVisible();
	await expect(time).toHaveAttribute('datetime', REFERENCE_ASOF);
	await expect(time).toHaveAttribute('title', /.+/);
	await expect(time).toHaveClass(/cursor-help/);
	await expect(time).toHaveClass(/border-dashed/);
	await expect(time).toHaveClass(/border-b/);
	await expect(time).toContainText('Mar');
	await expect(time).toContainText('2025');
	await expect(time).toHaveText(/\b(14|15)\b/);
});

test('asset detail page (SHARES) shows "As of <date>" next to the Quantity label', async ({
	page
}) => {
	const user = await seedUser('lorenzo');

	const asset = await seedAsset({
		name: 'As Of Shares',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks',
		type: AssetsTypeOptions.SHARES
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: REFERENCE_ASOF,
		quantity: 10,
		marketPrice: 100,
		bookPrice: 80
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/assets/${asset.id}`);

	const asOf = page.getByTestId('balance-as-of').first();
	await expect(asOf).toBeVisible();
	await expect(asOf).toHaveText(/^As of /);

	const time = asOf.locator('time');
	await expect(time).toBeVisible();
	await expect(time).toHaveAttribute('datetime', REFERENCE_ASOF);
	await expect(time).toHaveAttribute('title', /.+/);
	await expect(time).toHaveClass(/cursor-help/);
	await expect(time).toHaveClass(/border-dashed/);
	await expect(time).toHaveClass(/border-b/);
	await expect(time).toContainText('Mar');
	await expect(time).toContainText('2025');
	await expect(time).toHaveText(/\b(14|15)\b/);
});
