import { expect, test } from '@playwright/test';
import { setHours, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
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
	const fiveYears = subYears(now, 5);
	const ytd = startOfYear(now);
	const earliest = subYears(now, 6);

	const baselineCash: Array<[Date, number]> = [
		[earliest, 1000],
		[fiveYears, 2000],
		[oneYear, 3000],
		[ytd, 4000],
		[sixMonths, 5000],
		[oneMonth, 6000],
		[oneWeek, 7000],
		[now, 8000]
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
		[oneYear, -2500],
		[ytd, -3000],
		[sixMonths, -3500],
		[oneMonth, -3200],
		[oneWeek, -3100],
		[now, -3000]
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
		sold: now.toISOString()
	});
	const excludedDebtAsset = await seedAsset({
		name: 'Excluded Debt Asset',
		balanceGroup: AssetsBalanceGroupOptions.DEBT,
		balanceType: 'Loan',
		owner: user.id,
		excluded: now.toISOString()
	});
	for (const [date, value] of [
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
			value
		});
	}
	for (const [date, value] of [
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
			value
		});
	}

	const trendsLink = page.getByRole('link', { name: 'Trends' });
	if (!(await trendsLink.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(trendsLink).toBeVisible();
	}
	await trendsLink.click();
	const netRow = page.getByRole('row', { name: /Net worth/ });
	const cells = netRow.getByRole('cell');
	await expect(cells).toHaveCount(9);
	const firstCell = cells.nth(1).getByRole('button', { name: '+28.2%' });
	// HACK: the reactive value changes is flaky in CI so we reload the page if it's not visible
	if (!(await firstCell.isVisible())) await page.reload();
	await expect(firstCell).toBeVisible();
	await expect(cells.nth(2).getByRole('button', { name: '+78.6%' })).toBeVisible();
	await expect(cells.nth(3).getByRole('button', { name: '+233.3%' })).toBeVisible();
	await expect(cells.nth(4).getByRole('button', { name: '+400%' })).toBeVisible();
	await expect(cells.nth(5).getByRole('button', { name: '+900%' })).toBeVisible();
	await expect(cells.nth(6)).toContainText('~');
	await expect(cells.nth(7).getByRole('button', { name: '+900%' })).toBeVisible();

	const cashRow = page.getByRole('row', { name: /^Cash/ });
	const cashCells = cashRow.getByRole('cell');
	await expect(cashCells.nth(1).getByRole('button', { name: '+14.3%' })).toBeVisible();
	await expect(cashCells.nth(2).getByRole('button', { name: '+33.3%' })).toBeVisible();
	await expect(cashCells.nth(3).getByRole('button', { name: '+60%' })).toBeVisible();
	await expect(cashCells.nth(4).getByRole('button', { name: '+100%' })).toBeVisible();
	await expect(cashCells.nth(5).getByRole('button', { name: '+166.7%' })).toBeVisible();
	await expect(cashCells.nth(6).getByRole('button', { name: '+300%' })).toBeVisible();
	await expect(cashCells.nth(7).getByRole('button', { name: '+700%' })).toBeVisible();

	const debtRow = page.getByRole('row', { name: /^Debt/ });
	const debtCells = debtRow.getByRole('cell');
	await expect(debtCells.nth(1).getByRole('button', { name: '-3.2%' })).toBeVisible();
	await expect(debtCells.nth(2).getByRole('button', { name: '-6.3%' })).toBeVisible();
	await expect(debtCells.nth(3).getByRole('button', { name: '-14.3%' })).toBeVisible();
	await expect(debtCells.nth(4).getByRole('button', { name: '0%' })).toBeVisible();
	await expect(debtCells.nth(5).getByRole('button', { name: '+20%' })).toBeVisible();
	await expect(debtCells.nth(6).getByRole('button', { name: '+50%' })).toBeVisible();
	await expect(debtCells.nth(7).getByRole('button', { name: '+200%' })).toBeVisible();
});
