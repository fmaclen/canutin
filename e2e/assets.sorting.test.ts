import { expect, test } from '@playwright/test';

import { AssetsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAsset, seedAssetBalance, seedUser } from './pocketbase.helpers';

test('sorts assets by every column and preserves sorting across reloads', async ({ page }) => {
	const user = await seedUser('harris');
	const now = new Date().toISOString();
	// The dataset spans names, market and book values, gains, and gain percentages with distinct comparison pairs.
	const assets = [
		{ name: 'Low Value Asset', marketValue: 1000 },
		{ name: 'High Value Asset', marketValue: 50000 },
		{ name: 'Mid Value Asset', marketValue: 10000 },
		{ name: 'Zebra Corp', marketValue: 5000 },
		{ name: 'Alpha Inc', marketValue: 5000 },
		{ name: 'Low Cost Basis', bookValue: 1000, marketValue: 2000 },
		{ name: 'High Cost Basis', bookValue: 50000, marketValue: 45000 },
		{ name: 'Big Winner', bookValue: 10000, marketValue: 50000 },
		{ name: 'Big Loser', bookValue: 30000, marketValue: 10000 },
		{ name: 'High Percent Gain', bookValue: 1000, marketValue: 10000 },
		{ name: 'Low Percent Gain', bookValue: 9000, marketValue: 10000 },
		{ name: 'Test Asset For Sorting', marketValue: 5000 }
	];
	for (const assetData of assets) {
		const asset = await seedAsset({
			name: assetData.name,
			balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
			owner: user.id,
			balanceType: 'Stocks'
		});
		await seedAssetBalance({
			asset: asset.id,
			owner: user.id,
			asOf: now,
			bookValue: assetData.bookValue,
			marketValue: assetData.marketValue
		});
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Value Asset' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	// Market Value defaults descending, then toggles ascending and descending with its indicator.
	await expect(page.getByRole('row', { name: 'Test Asset For Sorting' })).toBeVisible();
	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);
	const marketValueButton = page.getByRole('button', { name: 'Market Value' });
	const marketValueHeader = marketValueButton.locator('xpath=..');
	await marketValueButton.click();
	await expect(page).toHaveURL(/sort=marketValue/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'ascending');
	expect(await getRowIndex(rows, 'Low Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'High Value Asset')
	);

	await marketValueButton.click();
	await expect(page).toHaveURL(/dir=desc/);
	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'descending');
	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);

	// Asset sorts alphabetically, transfers the indicator, and persists after reload.
	await expect(page.getByRole('row', { name: 'Zebra Corp' })).toBeVisible();
	const assetButton = page.getByRole('button', { name: 'Asset', exact: true });
	const assetHeader = assetButton.locator('xpath=..');
	await assetButton.click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(assetHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(marketValueHeader).not.toHaveAttribute('aria-sort');
	expect(await getRowIndex(rows, 'Zebra Corp')).toBeLessThan(await getRowIndex(rows, 'Alpha Inc'));

	await assetButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Alpha Inc')).toBeLessThan(await getRowIndex(rows, 'Zebra Corp'));

	await page.reload();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	// Book Value sorts the cost-basis pair in both directions.
	await expect(page.getByRole('row', { name: 'High Cost Basis' })).toBeVisible();
	const bookValueHeader = page.getByRole('button', { name: 'Book Value' });
	await bookValueHeader.click();
	await expect(page).toHaveURL(/sort=bookValue/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'High Cost Basis')).toBeLessThan(
		await getRowIndex(rows, 'Low Cost Basis')
	);

	await bookValueHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Low Cost Basis')).toBeLessThan(
		await getRowIndex(rows, 'High Cost Basis')
	);

	// Gain/Loss sorts the absolute gain pair in both directions.
	await expect(page.getByRole('row', { name: 'Big Winner' })).toBeVisible();
	const gainHeader = page.getByRole('button', { name: 'Gain/Loss' });
	await gainHeader.click();
	await expect(page).toHaveURL(/sort=gain/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Big Winner')).toBeLessThan(await getRowIndex(rows, 'Big Loser'));

	await gainHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Big Loser')).toBeLessThan(await getRowIndex(rows, 'Big Winner'));

	// Gain % sorts the percentage-gain pair in both directions.
	await expect(page.getByRole('row', { name: 'High Percent Gain' })).toBeVisible();
	const gainPercentHeader = page.getByRole('button', { name: 'Gain %' });
	await gainPercentHeader.click();
	await expect(page).toHaveURL(/sort=gainPercent/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'High Percent Gain')).toBeLessThan(
		await getRowIndex(rows, 'Low Percent Gain')
	);

	await gainPercentHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Low Percent Gain')).toBeLessThan(
		await getRowIndex(rows, 'High Percent Gain')
	);
});
