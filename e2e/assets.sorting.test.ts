import { expect, test } from '@playwright/test';

import { AssetsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAsset, seedAssetBalance, seedUser } from './pocketbase.helpers';

test('clicking Market Value header sorts by market value descending then ascending', async ({
	page
}) => {
	const user = await seedUser('harris');

	const lowValue = await seedAsset({
		name: 'Low Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1000
	});

	const highValue = await seedAsset({
		name: 'High Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'ETFs'
	});
	await seedAssetBalance({
		asset: highValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 50000
	});

	const midValue = await seedAsset({
		name: 'Mid Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Bonds'
	});
	await seedAssetBalance({
		asset: midValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Value Asset' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);

	const marketValueHeader = page.getByRole('button', { name: 'Market Value' });
	await marketValueHeader.click();

	await expect(page).toHaveURL(/sort=marketValue/);
	await expect(page).toHaveURL(/dir=asc/);

	expect(await getRowIndex(rows, 'Low Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'High Value Asset')
	);

	await marketValueHeader.click();
	await expect(page).toHaveURL(/dir=desc/);

	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);
});

test('clicking Asset header sorts alphabetically', async ({ page }) => {
	const user = await seedUser('ingrid');

	const zAsset = await seedAsset({
		name: 'Zebra Corp',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: zAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	const aAsset = await seedAsset({
		name: 'Alpha Inc',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: aAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Zebra Corp' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const assetHeader = page.getByRole('button', { name: 'Asset', exact: true });
	await assetHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Zebra Corp')).toBeLessThan(await getRowIndex(rows, 'Alpha Inc'));

	await assetHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Alpha Inc')).toBeLessThan(await getRowIndex(rows, 'Zebra Corp'));
});

test('clicking Book Value header sorts by book value', async ({ page }) => {
	const user = await seedUser('kendall');

	const lowCost = await seedAsset({
		name: 'Low Cost Basis',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowCost.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 1000,
		marketValue: 2000
	});

	const highCost = await seedAsset({
		name: 'High Cost Basis',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: highCost.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 50000,
		marketValue: 45000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Cost Basis' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

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
});

test('clicking Gain/Loss header sorts by gain amount', async ({ page }) => {
	const user = await seedUser('logan');

	const bigGain = await seedAsset({
		name: 'Big Winner',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: bigGain.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 50000
	});

	const bigLoss = await seedAsset({
		name: 'Big Loser',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: bigLoss.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 30000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Big Winner' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const gainHeader = page.getByRole('button', { name: 'Gain/Loss' });
	await gainHeader.click();

	await expect(page).toHaveURL(/sort=gain/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Big Winner')).toBeLessThan(await getRowIndex(rows, 'Big Loser'));

	await gainHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Big Loser')).toBeLessThan(await getRowIndex(rows, 'Big Winner'));
});

test('clicking Gain % header sorts by gain percentage', async ({ page }) => {
	const user = await seedUser('melinda');

	const highPercent = await seedAsset({
		name: 'High Percent Gain',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: highPercent.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 1000,
		marketValue: 10000
	});

	const lowPercent = await seedAsset({
		name: 'Low Percent Gain',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowPercent.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Percent Gain' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

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

test('sort state persists in URL and survives page reload', async ({ page }) => {
	const user = await seedUser('nolan');

	const asset = await seedAsset({
		name: 'Test Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Test Asset' })).toBeVisible();

	const assetHeader = page.getByRole('button', { name: 'Asset', exact: true });
	await assetHeader.click();
	await assetHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
});

test('sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('oscar');

	const asset = await seedAsset({
		name: 'Test Asset For Sorting',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Test Asset For Sorting' })).toBeVisible();

	const marketValueButton = page.getByRole('button', { name: 'Market Value' });
	const marketValueHeader = marketValueButton.locator('xpath=..');
	await marketValueButton.click();

	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'ascending');

	await marketValueButton.click();
	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'descending');

	const assetButton = page.getByRole('button', { name: 'Asset', exact: true });
	const assetHeader = assetButton.locator('xpath=..');
	await assetButton.click();

	await expect(assetHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(marketValueHeader).not.toHaveAttribute('aria-sort');
});
