import { expect, test, type Locator, type Page } from '@playwright/test';

import { AssetsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	recordExists,
	seedAsset,
	seedAssetBalance,
	seedUser,
	updateAsset
} from './pocketbase.helpers';

const assetTableColumnLabels = {
	asset: /^Asset$/,
	group: /^Group$/,
	category: /^Category$/,
	status: /^Status$/,
	bookValue: /^Book value$/,
	gainLoss: /^Gain\/loss$/,
	gainPercent: /^Gain %$/,
	marketValue: /^Market value$/
} as const;

const assetTableColumnOrder = [
	'asset',
	'group',
	'category',
	'status',
	'bookValue',
	'gainLoss',
	'gainPercent',
	'marketValue'
] as const satisfies ReadonlyArray<keyof typeof assetTableColumnLabels>;

type AssetTableColumn = (typeof assetTableColumnOrder)[number];

async function expectAssetRowCells(
	page: Page,
	row: Locator,
	expectedCells: Partial<Record<AssetTableColumn, string>>
) {
	// NOTE: Playwright exposes this header row's labels as `cell`; `columnheader` resolves to 0.
	const headers = page
		.getByRole('row', {
			name: /^Asset Group Category Status Book value Gain\/loss Gain % Market value$/
		})
		.getByRole('cell');
	await expect(headers).toHaveCount(assetTableColumnOrder.length);
	for (const column of assetTableColumnOrder) {
		await expect(headers.nth(assetTableColumnOrder.indexOf(column))).toHaveAccessibleName(
			assetTableColumnLabels[column]
		);
	}

	const cells = row.getByRole('cell');
	await expect(cells).toHaveCount(assetTableColumnOrder.length);
	for (const column of assetTableColumnOrder) {
		const expectedText = expectedCells[column];
		if (expectedText !== undefined) {
			await expect(cells.nth(assetTableColumnOrder.indexOf(column))).toHaveText(expectedText);
		}
	}
}

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

	const ownedRow = page.getByRole('row', { name: 'Growth Fund' });
	await expect(ownedRow).toBeVisible();
	await expectAssetRowCells(page, ownedRow, { status: '~', marketValue: '$5,000.00' });

	const excludedRow = page.getByRole('row', { name: 'Hidden Collectible' });
	await expect(excludedRow).toBeVisible();
	await expectAssetRowCells(page, excludedRow, {
		status: 'Excluded',
		marketValue: '$2,000.00'
	});

	const aggregateRow = page.getByRole('region', { name: 'Net market value' });
	await expect(aggregateRow).toContainText('$5,000.00');
	await expect(aggregateRow).not.toContainText('$2,000.00');
	await expect(page.getByRole('row', { name: 'Legacy Stock' })).not.toBeVisible();

	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page.getByRole('row', { name: 'Legacy Stock' })).toBeVisible();
	await expect(aggregateRow).toContainText('$8,500.00');

	await page.getByRole('tab', { name: 'Sold' }).click();
	const soldRow = page.getByRole('row', { name: 'Legacy Stock' });
	await expect(soldRow).toBeVisible();
	await expectAssetRowCells(page, soldRow, { status: 'Sold', marketValue: '$1,500.00' });
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

	const houseRow = page.getByRole('row', { name: 'Primary Residence' });
	await expect(houseRow).toBeVisible();
	await expectAssetRowCells(page, houseRow, {
		bookValue: '$500,000.00',
		gainLoss: '$150,000.00',
		gainPercent: '+30.0%',
		marketValue: '$650,000.00'
	});

	const carRow = page.getByRole('row', { name: 'Vehicle' });
	await expect(carRow).toBeVisible();
	await expectAssetRowCells(page, carRow, {
		bookValue: '$30,000.00',
		gainLoss: '-$8,000.00',
		gainPercent: '-26.7%',
		marketValue: '$22,000.00'
	});

	const fundRow = page.getByRole('row', { name: 'Stable Fund' });
	await expect(fundRow).toBeVisible();
	await expectAssetRowCells(page, fundRow, {
		bookValue: '$10,000.00',
		gainLoss: '$0.00',
		gainPercent: '0.0%',
		marketValue: '$10,000.00'
	});
});

test('assets table shows appreciation and depreciation for whole-value assets', async ({
	page
}) => {
	const user = await seedUser('karen');

	const gainAsset = await seedAsset({
		name: 'Growth Portfolio',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stock'
	});
	await seedAssetBalance({
		asset: gainAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 45000,
		marketValue: 87500
	});

	const lossAsset = await seedAsset({
		name: 'Loss Portfolio',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stock'
	});
	await seedAssetBalance({
		asset: lossAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 7500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const growthPortfolioRow = page.getByRole('row', { name: 'Growth Portfolio' });
	await expect(growthPortfolioRow).toBeVisible();
	await expectAssetRowCells(page, growthPortfolioRow, {
		bookValue: '$45,000.00',
		gainLoss: '$42,500.00',
		gainPercent: '+94.4%',
		marketValue: '$87,500.00'
	});

	const lossPortfolioRow = page.getByRole('row', { name: 'Loss Portfolio' });
	await expect(lossPortfolioRow).toBeVisible();
	await expectAssetRowCells(page, lossPortfolioRow, {
		bookValue: '$10,000.00',
		gainLoss: '-$2,500.00',
		gainPercent: '-25.0%',
		marketValue: '$7,500.00'
	});
});

test('user can add a new whole-valued asset', async ({ page }) => {
	const user = await seedUser('liam');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	await expect(page.getByRole('row', { name: 'Gold Coins' })).not.toBeVisible();

	await page.getByRole('link', { name: 'Add asset' }).click();
	await expect(page).toHaveURL('/assets/add');
	await expect(page.getByLabel('Symbol')).not.toBeVisible();
	await expect(page.getByLabel('Quantity')).not.toBeVisible();
	await expect(page.getByLabel('Book price')).not.toBeVisible();
	await expect(page.getByLabel('Market price')).not.toBeVisible();
	await expect(page.getByLabel('Book value')).toBeVisible();
	await expect(page.getByLabel('Market value', { exact: true })).toBeVisible();

	await page.getByLabel('Name').fill('Gold Coins');
	await page.getByLabel('Balance group').click();
	await page.getByText('Other assets').click();
	await page.getByLabel('Category').fill('Precious Metals');
	await page.getByLabel('Notes').fill('Stored in safety deposit box #142');
	await page.getByLabel('Book value').fill('12000');
	await page.getByLabel('Market value', { exact: true }).fill('15000');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Asset added')).toBeVisible();
	await expect(page).toHaveURL('/assets');

	const wholeAssetRow = page.getByRole('row', { name: 'Gold Coins' });
	await expect(wholeAssetRow).toBeVisible();
	await expectAssetRowCells(page, wholeAssetRow, {
		bookValue: '$12,000.00',
		marketValue: '$15,000.00'
	});
});

test('optional currency fields show placeholder when not set', async ({ page }) => {
	const user = await seedUser('nina');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	await page.getByRole('link', { name: 'Add asset' }).click();
	await expect(page).toHaveURL('/assets/add');

	await page.getByLabel('Name').fill('Art Piece');
	await page.getByLabel('Balance group').click();
	await page.getByText('Other assets').click();
	await page.getByLabel('Category').fill('Art');
	await page.getByLabel('Market value', { exact: true }).fill('5000');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Asset added')).toBeVisible();
	await expect(page).toHaveURL('/assets');

	await page.getByRole('link', { name: 'Art Piece' }).click();
	await expect(page.getByLabel('Market value', { exact: true })).toHaveValue('$5,000.00');
	await expect(page.getByLabel('Book value')).toHaveValue('');
});

test('user can edit asset details and update balance', async ({ page }) => {
	const user = await seedUser('maya');

	const wholeAsset = await seedAsset({
		name: 'Vintage Watch Collection',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Collectibles'
	});
	await seedAssetBalance({
		asset: wholeAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const initialRow = page.getByRole('row', { name: 'Vintage Watch Collection' });
	await expect(initialRow).toBeVisible();
	await expectAssetRowCells(page, initialRow, {
		bookValue: '$10,000.00',
		marketValue: '$10,000.00'
	});

	await initialRow.getByRole('link', { name: 'Vintage Watch Collection' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${wholeAsset.id}(\\?|$)`));
	await expect(page.getByLabel('Name')).toHaveValue('Vintage Watch Collection');
	await expect(page.getByLabel('Category')).toHaveValue('Collectibles');
	await expect(page.getByLabel('Symbol')).not.toBeVisible();
	await expect(page.getByLabel('Quantity')).not.toBeVisible();
	await expect(page.getByLabel('Book price')).not.toBeVisible();
	await expect(page.getByLabel('Market price')).not.toBeVisible();
	await expect(page.getByLabel('Notes')).toHaveValue('');

	await page.getByLabel('Name').fill('Rare Coin Collection');
	await page.getByLabel('Category').fill('Collectibles');
	await page.getByLabel('Balance group').click();
	await page.getByText('Investments').click();
	await page.getByLabel('Notes').fill('Appraised annually — next appraisal due Jan 2027');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Asset updated')).toBeVisible();
	await expect(
		page.getByText(
			'This asset has been updated elsewhere and your changes may be based on outdated data'
		)
	).not.toBeVisible();
	await expect(page).toHaveURL('/assets');
	await expect(page.getByRole('row', { name: 'Vintage Watch Collection' })).not.toBeVisible();

	const renamedRow = page.getByRole('row', { name: 'Rare Coin Collection' });
	await expect(renamedRow).toBeVisible();
	await expectAssetRowCells(page, renamedRow, { category: 'Collectibles' });

	await renamedRow.getByRole('link', { name: 'Rare Coin Collection' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${wholeAsset.id}(\\?|$)`));
	await expect(page.getByLabel('Name')).toHaveValue('Rare Coin Collection');
	await expect(page.getByLabel('Category')).toHaveValue('Collectibles');
	await expect(page.getByLabel('Balance group')).toHaveText('Investments');
	await expect(page.getByLabel('Notes')).toHaveValue(
		'Appraised annually — next appraisal due Jan 2027'
	);
	await expect(page.getByLabel('Exclude from net worth')).not.toBeChecked();

	await page.getByLabel('Market value', { exact: true }).fill('12500');
	await page.getByLabel('Book value').fill('10000');
	await page.getByRole('button', { name: 'Update' }).click();
	await expect(page.getByText('Balance updated')).toBeVisible();
	await expect(page).toHaveURL('/assets');

	const updatedRow = page.getByRole('row', { name: 'Rare Coin Collection' });
	await expect(updatedRow).toBeVisible();
	await expectAssetRowCells(page, updatedRow, {
		bookValue: '$10,000.00',
		marketValue: '$12,500.00'
	});

	await updatedRow.getByRole('link', { name: 'Rare Coin Collection' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${wholeAsset.id}(\\?|$)`));
	await page.getByLabel('Exclude from net worth').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Asset updated').first()).toBeVisible();
	await expect(page).toHaveURL('/assets');

	await page.getByRole('row', { name: 'Rare Coin Collection' }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/assets/${wholeAsset.id}(\\?|$)`));
	await expect(page.getByLabel('Exclude from net worth')).toBeChecked();
	await page.getByLabel('Exclude from net worth').uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Asset updated').first()).toBeVisible();
	await expect(page).toHaveURL('/assets');

	await page.getByRole('row', { name: 'Rare Coin Collection' }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/assets/${wholeAsset.id}(\\?|$)`));
	await expect(page.getByLabel('Exclude from net worth')).not.toBeChecked();
});

test('user can directly navigate to asset edit page', async ({ page }) => {
	const user = await seedUser('olivia');

	const vehicle = await seedAsset({
		name: '2020 Honda Civic',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Vehicle'
	});
	await seedAssetBalance({
		asset: vehicle.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 20000,
		marketValue: 18500
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/assets/${vehicle.id}`);
	await expect(page).toHaveURL(`/assets/${vehicle.id}`);
	await expect(page.getByLabel('Name')).toHaveValue('2020 Honda Civic');
	await expect(page.getByLabel('Category')).toHaveValue('Vehicle');
	await expect(page.getByLabel('Market value', { exact: true })).toHaveValue('$18,500.00');
	await expect(page.getByLabel('Book value')).toHaveValue('$20,000.00');
});

test('user sees stale data warning and can refresh form', async ({ page }) => {
	const user = await seedUser('patricia');

	const investment = await seedAsset({
		name: 'Vanguard Total Stock Market',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Index Fund'
	});
	await seedAssetBalance({
		asset: investment.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 50000,
		marketValue: 55000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	await page.getByRole('link', { name: 'Vanguard Total Stock Market' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${investment.id}(\\?|$)`));
	await expect(page.getByLabel('Name')).toHaveValue('Vanguard Total Stock Market');

	await page.getByLabel('Name').fill('My Investment Fund');
	await updateAsset(investment.id, { name: 'Vanguard S&P 500 Index Fund' });
	await expect(
		page.getByText(
			'This asset has been updated elsewhere and your changes may be based on outdated data'
		)
	).toBeVisible();

	const refreshButton = page.getByRole('button', { name: 'Refresh' });
	await expect(refreshButton).toBeVisible();

	await refreshButton.click();
	await expect(page.getByText("You're now viewing the latest data for this asset")).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveValue('Vanguard S&P 500 Index Fund');
});

test('user can delete asset and cascade deletes balances', async ({ page }) => {
	const user = await seedUser('victor');

	const asset = await seedAsset({
		name: 'Old Investment',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'ETF'
	});

	const balance = await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 12000
	});

	expect(await recordExists('assets', asset.id)).toBe(true);
	expect(await recordExists('assetBalances', balance.id)).toBe(true);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');

	const assetRow = page.getByRole('row', { name: 'Old Investment' });
	await expect(assetRow).toBeVisible();

	await assetRow.getByRole('link', { name: 'Old Investment' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${asset.id}(\\?|$)`));

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Asset deleted')).toBeVisible();
	await expect(page).toHaveURL('/assets');
	await expect(page.getByRole('row', { name: 'Old Investment' })).not.toBeVisible();

	expect(await recordExists('assets', asset.id)).toBe(false);
	expect(await recordExists('assetBalances', balance.id)).toBe(false);
});
