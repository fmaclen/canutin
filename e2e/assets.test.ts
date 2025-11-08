import { expect, test } from '@playwright/test';

import { AssetsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAsset, seedAssetBalance, seedUser } from './pocketbase.helpers';

test('assets table reflects filters and aggregate totals', async ({ page }) => {
	const user = await seedUser('ivy');

	const ownedAsset = await seedAsset({
		name: 'Growth Fund',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'ETF'
	});
	await seedAssetBalance({
		asset: ownedAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	const excludedAsset = await seedAsset({
		name: 'Hidden Collectible',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Collectible',
		excluded: new Date().toISOString()
	});
	await seedAssetBalance({
		asset: excludedAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 2000
	});

	const soldAsset = await seedAsset({
		name: 'Legacy Stock',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stock',
		sold: new Date().toISOString()
	});
	await seedAssetBalance({
		asset: soldAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');

	const ownedRow = page.getByRole('row', { name: /Growth Fund/ });
	await expect(ownedRow).toBeVisible();
	const ownedCells = ownedRow.locator('td');
	await expect(ownedCells.nth(8)).toContainText('$5,000.00');
	await expect(ownedRow.getByText('Excluded')).not.toBeVisible();
	await expect(ownedRow.getByText('Sold')).not.toBeVisible();

	const excludedRow = page.getByRole('row', { name: /Hidden Collectible/ });
	await expect(excludedRow).toBeVisible();
	const excludedCells = excludedRow.locator('td');
	await expect(excludedCells.nth(8)).toContainText('$2,000.00');
	await expect(excludedRow.getByText('Excluded')).toBeVisible();

	const aggregateRow = page.getByRole('row', { name: /Assets aggregate total/ });
	await expect(aggregateRow).toContainText('$5,000.00');
	await expect(aggregateRow).not.toContainText('$2,000.00');
	await expect(page.getByRole('row', { name: /Legacy Stock/ })).not.toBeVisible();

	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page.getByRole('row', { name: /Legacy Stock/ })).toBeVisible();
	await expect(aggregateRow).toContainText('$8,500.00');

	await page.getByRole('tab', { name: 'Sold' }).click();
	const soldRow = page.getByRole('row', { name: /Legacy Stock/ });
	await expect(soldRow).toBeVisible();
	await expect(soldRow.getByText('Sold')).toBeVisible();
	await expect(aggregateRow).toContainText('$1,500.00');
});

test('assets table shows appreciation and depreciation for whole assets', async ({ page }) => {
	const user = await seedUser('janet');

	const appreciatingHouse = await seedAsset({
		name: 'Primary Residence',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Real Estate'
	});
	await seedAssetBalance({
		asset: appreciatingHouse.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 500000,
		marketValue: 650000
	});

	const depreciatingCar = await seedAsset({
		name: 'Vehicle',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Vehicle'
	});
	await seedAssetBalance({
		asset: depreciatingCar.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 30000,
		marketValue: 22000
	});

	const breakEvenAsset = await seedAsset({
		name: 'Stable Fund',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'ETF'
	});
	await seedAssetBalance({
		asset: breakEvenAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const houseRow = page.getByRole('row', { name: /Primary Residence/ });
	await expect(houseRow).toBeVisible();
	const houseCells = houseRow.locator('td');
	await expect(houseCells.nth(5)).toContainText('$500,000.00');
	await expect(houseCells.nth(6)).toContainText('$150,000.00');
	await expect(houseCells.nth(7)).toContainText('+30.0%');
	await expect(houseCells.nth(8)).toContainText('$650,000.00');

	const carRow = page.getByRole('row', { name: /Vehicle/ });
	await expect(carRow).toBeVisible();
	const carCells = carRow.locator('td');
	await expect(carCells.nth(5)).toContainText('$30,000.00');
	await expect(carCells.nth(6)).toContainText('-$8,000.00');
	await expect(carCells.nth(7)).toContainText('-26.7%');
	await expect(carCells.nth(8)).toContainText('$22,000.00');

	const fundRow = page.getByRole('row', { name: /Stable Fund/ });
	await expect(fundRow).toBeVisible();
	const fundCells = fundRow.locator('td');
	await expect(fundCells.nth(5)).toContainText('$10,000.00');
	await expect(fundCells.nth(6)).toContainText('$0.00');
	await expect(fundCells.nth(7)).toContainText('0.0%');
	await expect(fundCells.nth(8)).toContainText('$10,000.00');
});

test('assets table shows appreciation and depreciation for shares assets', async ({ page }) => {
	const user = await seedUser('karen');

	const gainStock = await seedAsset({
		name: 'NVDA',
		symbol: 'NVDA',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stock'
	});
	await seedAssetBalance({
		asset: gainStock.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		quantity: 100,
		bookPrice: 450,
		marketPrice: 875,
		bookValue: 45000,
		marketValue: 87500
	});

	const lossStock = await seedAsset({
		name: 'XYZ',
		symbol: 'XYZ',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stock'
	});
	await seedAssetBalance({
		asset: lossStock.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		quantity: 50,
		bookPrice: 200,
		marketPrice: 150,
		bookValue: 10000,
		marketValue: 7500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const nvdaRow = page.getByRole('row', { name: /NVDA/ });
	await expect(nvdaRow).toBeVisible();
	const nvdaCells = nvdaRow.locator('td');
	await expect(nvdaCells.nth(5)).toContainText('$45,000.00');
	await expect(nvdaCells.nth(6)).toContainText('$42,500.00');
	await expect(nvdaCells.nth(7)).toContainText('+94.4%');
	await expect(nvdaCells.nth(8)).toContainText('$87,500.00');

	const xyzRow = page.getByRole('row', { name: /XYZ/ });
	await expect(xyzRow).toBeVisible();
	const xyzCells = xyzRow.locator('td');
	await expect(xyzCells.nth(5)).toContainText('$10,000.00');
	await expect(xyzCells.nth(6)).toContainText('-$2,500.00');
	await expect(xyzCells.nth(7)).toContainText('-25.0%');
	await expect(xyzCells.nth(8)).toContainText('$7,500.00');
});

test('user can add a new asset with type WHOLE or SHARES', async ({ page }) => {
	const user = await seedUser('liam');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	await expect(page.getByRole('row', { name: /Gold Coins/ })).not.toBeVisible();
	await expect(page.getByRole('row', { name: /AAPL/ })).not.toBeVisible();

	await page.getByRole('link', { name: 'Add asset' }).click();
	await expect(page).toHaveURL('/assets/add');

	await page.getByLabel('Type', { exact: true }).click();
	await page.getByText('Whole').click();
	await expect(page.getByLabel('Quantity')).not.toBeVisible();
	await expect(page.getByLabel('Book price')).not.toBeVisible();
	await expect(page.getByLabel('Market price')).not.toBeVisible();
	await expect(page.getByLabel('Book value')).toBeVisible();
	await expect(page.getByLabel('Market value')).toBeVisible();

	await page.getByLabel('Name').fill('Gold Coins');
	await page.getByLabel('Balance group').click();
	await page.getByText('Other assets').click();
	await page.getByLabel('Category').fill('Precious Metals');
	await page.getByLabel('Book value').fill('12000');
	await page.getByLabel('Market value').fill('15000');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Asset added successfully')).toBeVisible();
	await expect(page).toHaveURL('/assets');

	const wholeAssetRow = page.getByRole('row', { name: /Gold Coins/ });
	await expect(wholeAssetRow).toBeVisible();

	const wholeCells = wholeAssetRow.locator('td');
	await expect(wholeCells.nth(0)).toContainText('Gold Coins');
	await expect(wholeCells.nth(5)).toContainText('$12,000.00');
	await expect(wholeCells.nth(8)).toContainText('$15,000.00');

	await page.getByRole('link', { name: 'Add asset' }).click();
	await expect(page).toHaveURL('/assets/add');

	await page.getByLabel('Type', { exact: true }).click();
	await page.getByText('Shares').click();
	await expect(page.getByLabel('Quantity')).toBeVisible();
	await expect(page.getByLabel('Book price')).toBeVisible();
	await expect(page.getByLabel('Market price')).toBeVisible();
	await expect(page.getByLabel('Book value')).not.toBeVisible();
	await expect(page.getByLabel('Market value')).not.toBeVisible();

	await page.getByLabel('Name').fill('Apple Inc.');
	await page.getByLabel('Symbol').fill('AAPL');
	await page.getByLabel('Balance group').click();
	await page.getByText('Investments').click();
	await page.getByLabel('Category').fill('Stock');
	await page.getByLabel('Quantity').fill('50');
	await page.getByLabel('Book price').fill('150');
	await page.getByLabel('Market price').fill('180');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Asset added successfully')).toBeVisible();
	await expect(page).toHaveURL('/assets');

	const sharesAssetRow = page.getByRole('row', { name: /AAPL/ });
	await expect(sharesAssetRow).toBeVisible();

	const sharesCells = sharesAssetRow.locator('td');
	await expect(sharesCells.nth(0)).toContainText('Apple Inc.');
	await expect(sharesCells.nth(1)).toContainText('AAPL');
	await expect(sharesCells.nth(5)).toContainText('$7,500.00');
	await expect(sharesCells.nth(8)).toContainText('$9,000.00');
});
