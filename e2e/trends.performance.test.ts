import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { startOfDay, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
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

	// NOTE: the growth chart and performance table each settle to this empty state, so
	// two matches means both skeletons cleared.
	await goToPageViaSidebar(page, 'Trends');
	await expect(page.getByText('No accounts or assets yet')).toHaveCount(2);
	await expect(page.locator('[data-growth-period]')).toHaveCount(0);
	await goToPageViaSidebar(page, 'Big picture');

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

	// Mirror the app's UTC day-boundary math: the trends code computes "now" with
	// `startOfDay(new UTCDate())` and derives every window edge from it. Deriving the
	// seed dates the same way keeps the seed instants on the exact UTC midnights the
	// growth chart iterates over, so balance selection is identical regardless of the
	// runner/browser timezone (desktop vs mobile) or time of day.
	const now = startOfDay(new UTCDate());

	const oneWeek = subDays(now, 7);
	const oneMonth = subMonths(now, 1);
	const sixMonths = subMonths(now, 6);
	const oneYear = subYears(now, 1);
	const earliest = subYears(now, 6);
	const todayStart = now;
	const twoYearsStart = subYears(now, 2);

	// Window-start balances sit a few days BEFORE the computed 2Y/5Y window starts so
	// they are unambiguously the latest balance at-or-before the window's first
	// datepoint. Seeding exactly on the window edge lets tiny instant differences flip
	// which balance gets selected at the boundary.
	const beforeTwoYears = subDays(subYears(now, 2), 3);
	const beforeFiveYears = subDays(subYears(now, 5), 3);

	// YTD balance should be on Jan 1st to match the app's YTD anchor calculation.
	const ytd = startOfYear(now);

	const baselineCash: Array<[Date, number]> = [
		[earliest, 1000],
		[beforeFiveYears, 2000],
		[beforeTwoYears, 2600],
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
			asOf: date.toISOString(),
			value
		});
	}

	const baselineDebt: Array<[Date, number]> = [
		[earliest, -1000],
		[beforeFiveYears, -2000],
		[beforeTwoYears, -2100],
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
			asOf: date.toISOString(),
			value
		});
	}

	// The closed account and sold asset are zeroed at-or-after this instant. A
	// deterministic mid-window past date (about a month ago, at UTC midnight) keeps
	// them present at every historical datepoint (including the 2Y/5Y/earliest window
	// starts) and zeroed by the final datepoint (today's UTC midnight), since the
	// close/sell instant is now strictly before today's datepoint.
	const closeSell = subMonths(now, 1);

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
		closed: closeSell.toISOString()
	});
	for (const [date, value] of [
		[earliest, 10_000],
		[beforeFiveYears, 20_000],
		[oneYear, 30_000],
		[ytd, 40_000],
		[sixMonths, 50_000],
		[oneMonth, 60_000],
		[oneWeek, 70_000],
		[todayStart, 80_000]
	] as Array<[Date, number]>) {
		await seedAccountBalance({
			account: excludedInvestmentAccount.id,
			owner: user.id,
			asOf: date.toISOString(),
			value
		});
	}
	for (const [date, value] of [
		[earliest, 5_000],
		[beforeFiveYears, 4_000],
		[oneYear, 3_000],
		[ytd, 2_000],
		[sixMonths, 1_000],
		[oneMonth, 500],
		[oneWeek, 250],
		[todayStart, 100]
	] as Array<[Date, number]>) {
		await seedAccountBalance({
			account: closedOtherAccount.id,
			owner: user.id,
			asOf: date.toISOString(),
			value
		});
	}

	const soldAsset = await seedAsset({
		name: 'Sold Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Stock',
		owner: user.id,
		sold: closeSell.toISOString()
	});
	const excludedDebtAsset = await seedAsset({
		name: 'Excluded Debt Asset',
		balanceGroup: AssetsBalanceGroupOptions.DEBT,
		balanceType: 'Loan',
		owner: user.id,
		excluded: now.toISOString()
	});
	for (const [date, marketValue] of [
		[earliest, 12_000],
		[beforeFiveYears, 18_000],
		[oneYear, 24_000],
		[ytd, 30_000],
		[sixMonths, 36_000],
		[oneMonth, 42_000],
		[oneWeek, 48_000],
		[todayStart, 54_000]
	] as Array<[Date, number]>) {
		await seedAssetBalance({
			asset: soldAsset.id,
			owner: user.id,
			asOf: date.toISOString(),
			marketValue
		});
	}
	for (const [date, marketValue] of [
		[earliest, -2_000],
		[beforeFiveYears, -4_000],
		[oneYear, -3_500],
		[ytd, -3_000],
		[sixMonths, -2_500],
		[oneMonth, -2_200],
		[oneWeek, -2_100],
		[todayStart, -2_000]
	] as Array<[Date, number]>) {
		await seedAssetBalance({
			asset: excludedDebtAsset.id,
			owner: user.id,
			asOf: date.toISOString(),
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
	await expect(growthChart).toHaveAttribute('data-growth-start-net', '22500');
	await expect(growthChart).toHaveAttribute('data-growth-end-net', '5000');

	// The performance table is bounded to 5 years, but the MAX growth chart receives the
	// full-history balances, so its range start reaches the earliest seeded balance (6 years
	// back) rather than the 2Y window start.
	await page.getByRole('tab', { name: 'MAX' }).click();
	const maxChart = page.locator('[data-growth-period="max"]');
	await expect(maxChart).toHaveAttribute('data-growth-start', earliest.toISOString().slice(0, 10));
	await expect(maxChart).not.toHaveAttribute(
		'data-growth-start',
		twoYearsStart.toISOString().slice(0, 10)
	);

	// Table columns: Group | 1W | 1M | 6M | YTD | 1Y | 2Y | 5Y | MAX | Allocation
	// Columns 1-5 (1W, 1M, 6M, YTD, 1Y) can have date collisions depending on
	// when the test runs (e.g., 1W and YTD collide in early January).
	// We only assert exact values for stable columns (2Y, 5Y, MAX) and verify
	// volatile columns render a percentage or placeholder.

	const netRow = page.getByRole('row', { name: /Net worth/ });
	const netCells = netRow.getByRole('cell');
	await expect(netCells).toHaveCount(10, { timeout: 10000 });

	for (const i of [1, 2, 3, 4, 5]) {
		const cell = netCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	// Stable periods: exact values. Closed accounts and sold assets contribute their
	// last-known value to historical datepoints (zeroed only at/after their close/sell
	// date), so the net at every prior anchor includes Closed Other and Sold Asset.
	await expect(netCells.nth(6).getByRole('button', { name: '-77.8%' })).toBeVisible();
	await expect(netCells.nth(7).getByRole('button', { name: '-77.3%' })).toBeVisible();
	await expect(netCells.nth(8).getByRole('button', { name: '-70.6%' })).toBeVisible();

	const cashRow = page.getByRole('row', { name: /^Cash/ });
	const cashCells = cashRow.getByRole('cell');

	for (const i of [1, 2, 3, 4, 5]) {
		const cell = cashCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	await expect(cashCells.nth(6).getByRole('button', { name: '+207.7%' })).toBeVisible();
	await expect(cashCells.nth(7).getByRole('button', { name: '+300%' })).toBeVisible();
	await expect(cashCells.nth(8).getByRole('button', { name: '+700%' })).toBeVisible();

	const debtRow = page.getByRole('row', { name: /^Debt/ });
	const debtCells = debtRow.getByRole('cell');

	for (const i of [1, 2, 3, 4, 5]) {
		const cell = debtCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	await expect(debtCells.nth(6).getByRole('button', { name: '+42.9%' })).toBeVisible();
	await expect(debtCells.nth(7).getByRole('button', { name: '+50%' })).toBeVisible();
	await expect(debtCells.nth(8).getByRole('button', { name: '+200%' })).toBeVisible();
});
