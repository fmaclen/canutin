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
		value: 5000
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
		value: 2000
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
		value: 1500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');

	const ownedRow = page.getByRole('row', { name: /Growth Fund/ });
	await expect(ownedRow).toBeVisible();
	const ownedCells = ownedRow.locator('td');
	await expect(ownedCells.nth(5)).toContainText('$5,000.00');
	await expect(ownedRow.getByText('Excluded')).not.toBeVisible();
	await expect(ownedRow.getByText('Sold')).not.toBeVisible();

	const excludedRow = page.getByRole('row', { name: /Hidden Collectible/ });
	await expect(excludedRow).toBeVisible();
	const excludedCells = excludedRow.locator('td');
	await expect(excludedCells.nth(5)).toContainText('$2,000.00');
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
