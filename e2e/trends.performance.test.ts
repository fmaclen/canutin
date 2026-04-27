import { expect, test } from '@playwright/test';
import { setHours, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions,
	AssetsTypeOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedUser
} from './pocketbase.helpers';

test('trends performance table', async ({ page }) => {
	const user = await seedUser('steve');

	await page.goto('/');
	await signIn(page, user.email);

	const cashAccount = await seedAccount({
		name: 'Perf Test',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	const debtAccount = await seedAccount({
		name: 'Perf Debt',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card'
	});

	const now = new Date();
	const oneWeek = subDays(now, 7);
	const oneMonth = subMonths(now, 1);
	const sixMonths = subMonths(now, 6);
	const oneYear = subYears(now, 1);
	const twoYears = subYears(now, 2);
	const fiveYears = subYears(now, 5);
	const earliest = subYears(now, 6);
	const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const twoYearsStart = new Date(
		Date.UTC(twoYears.getUTCFullYear(), twoYears.getUTCMonth(), twoYears.getUTCDate())
	);

	// YTD balance should be on Jan 1st to match the app's YTD anchor calculation.
	// The app uses `endOfDay(startOfYear(new Date()))` for YTD, so a balance at
	// Jan 1st 12:00 will be found. This avoids collision with the 1W balance
	// which falls in December when running in the first week of January.
	const ytd = startOfYear(now);

	const baselineCash: Array<[Date, number]> = [
		[earliest, 1000],
		[fiveYears, 2000],
		[twoYearsStart, 2600],
		[oneYear, 3000],
		[ytd, 4000],
		[sixMonths, 5000],
		[oneMonth, 6000],
		[oneWeek, 7000],
		[todayStart, 8000]
	];

	for (const [date, value] of baselineCash) {
		await seedAccountBalance({
			account: cashAccount.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			value
		});
	}

	const baselineDebt: Array<[Date, number]> = [
		[earliest, -1000],
		[fiveYears, -2000],
		[twoYearsStart, -2100],
		[oneYear, -2500],
		[ytd, -3000],
		[sixMonths, -3500],
		[oneMonth, -3200],
		[oneWeek, -3100],
		[todayStart, -3000]
	];

	for (const [date, value] of baselineDebt) {
		await seedAccountBalance({
			account: debtAccount.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			value
		});
	}

	const excludedInvestmentAccount = await seedAccount({
		name: 'Excluded Invest',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage',
		excluded: now.toISOString()
	});
	const closedOtherAccount = await seedAccount({
		name: 'Closed Other',
		balanceGroup: AccountsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Other',
		closed: now.toISOString()
	});
	for (const [date, value] of [
		[earliest, 10_000],
		[fiveYears, 20_000],
		[oneYear, 30_000],
		[ytd, 40_000],
		[sixMonths, 50_000],
		[oneMonth, 60_000],
		[oneWeek, 70_000],
		[now, 80_000]
	] as Array<[Date, number]>) {
		await seedAccountBalance({
			account: excludedInvestmentAccount.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			value
		});
	}
	for (const [date, value] of [
		[earliest, 5_000],
		[fiveYears, 4_000],
		[oneYear, 3_000],
		[ytd, 2_000],
		[sixMonths, 1_000],
		[oneMonth, 500],
		[oneWeek, 250],
		[now, 100]
	] as Array<[Date, number]>) {
		await seedAccountBalance({
			account: closedOtherAccount.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			value
		});
	}

	const soldAsset = await seedAsset({
		name: 'Sold Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Stock',
		owner: user.id,
		type: AssetsTypeOptions.WHOLE,
		sold: now.toISOString()
	});
	const excludedDebtAsset = await seedAsset({
		name: 'Excluded Debt Asset',
		balanceGroup: AssetsBalanceGroupOptions.DEBT,
		balanceType: 'Loan',
		owner: user.id,
		type: AssetsTypeOptions.WHOLE,
		excluded: now.toISOString()
	});
	for (const [date, marketValue] of [
		[earliest, 12_000],
		[fiveYears, 18_000],
		[oneYear, 24_000],
		[ytd, 30_000],
		[sixMonths, 36_000],
		[oneMonth, 42_000],
		[oneWeek, 48_000],
		[now, 54_000]
	] as Array<[Date, number]>) {
		await seedAssetBalance({
			asset: soldAsset.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			marketValue
		});
	}
	for (const [date, marketValue] of [
		[earliest, -2_000],
		[fiveYears, -4_000],
		[oneYear, -3_500],
		[ytd, -3_000],
		[sixMonths, -2_500],
		[oneMonth, -2_200],
		[oneWeek, -2_100],
		[now, -2_000]
	] as Array<[Date, number]>) {
		await seedAssetBalance({
			asset: excludedDebtAsset.id,
			owner: user.id,
			asOf: setHours(date, 12).toISOString(),
			marketValue
		});
	}

	await goToPageViaSidebar(page, 'Trends');

	await page.getByRole('tab', { name: '2Y' }).click();
	const growthChart = page.locator('[data-growth-period="2y"]');
	await expect(growthChart).toHaveAttribute(
		'data-growth-start',
		twoYearsStart.toISOString().slice(0, 10)
	);
	await expect(growthChart).toHaveAttribute('data-growth-start-net', '500');
	await expect(growthChart).toHaveAttribute('data-growth-end-net', '5000');

	// Table columns: Group | 1W | 1M | 6M | YTD | 1Y | 2Y | 5Y | MAX | Allocation
	// Columns 1-5 (1W, 1M, 6M, YTD, 1Y) can have date collisions depending on
	// when the test runs (e.g., 1W and YTD collide in early January).
	// We only assert exact values for stable columns (2Y, 5Y, MAX) and verify
	// volatile columns render a percentage or placeholder.

	const netRow = page.getByRole('row', { name: /Net worth/ });
	const netCells = netRow.getByRole('cell');
	await expect(netCells).toHaveCount(10, { timeout: 10000 });

	// Volatile periods: just verify they render (percentage button or ~ placeholder)
	for (const i of [1, 2, 3, 4, 5]) {
		const cell = netCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	// Stable periods: exact values
	await expect(netCells.nth(6).getByRole('button', { name: '+900%' })).toBeVisible(); // 2Y
	await expect(netCells.nth(7)).toContainText('~'); // 5Y - no data (net was 0)
	await expect(netCells.nth(8).getByRole('button', { name: '+900%' })).toBeVisible(); // MAX

	const cashRow = page.getByRole('row', { name: /^Cash/ });
	const cashCells = cashRow.getByRole('cell');

	for (const i of [1, 2, 3, 4, 5]) {
		const cell = cashCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	await expect(cashCells.nth(6).getByRole('button', { name: '+207.7%' })).toBeVisible(); // 2Y
	await expect(cashCells.nth(7).getByRole('button', { name: '+300%' })).toBeVisible(); // 5Y
	await expect(cashCells.nth(8).getByRole('button', { name: '+700%' })).toBeVisible(); // MAX

	const debtRow = page.getByRole('row', { name: /^Debt/ });
	const debtCells = debtRow.getByRole('cell');

	for (const i of [1, 2, 3, 4, 5]) {
		const cell = debtCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	await expect(debtCells.nth(6).getByRole('button', { name: '+42.9%' })).toBeVisible(); // 2Y
	await expect(debtCells.nth(7).getByRole('button', { name: '+50%' })).toBeVisible(); // 5Y
	await expect(debtCells.nth(8).getByRole('button', { name: '+200%' })).toBeVisible(); // MAX
});
