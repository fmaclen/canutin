import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { startOfDay, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { dragChart, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedUser
} from './pocketbase.helpers';

test('trends performance table', async ({ page, isMobile }) => {
	const user = await seedUser('steve');

	await page.goto('/');
	await signIn(page, user.email);

	// NOTE: the growth chart and performance table each settle to this empty state, so
	// two matches means both skeletons cleared.
	await goToPageViaSidebar(page, 'Trends');
	await expect(page.getByText('No accounts or assets yet')).toHaveCount(2);
	await expect(page.locator('[data-growth-chart]')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Cash', exact: true })).toHaveCount(0);
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
	const threeMonths = subMonths(now, 3);
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

	// A cash member that is zero across the whole window: it contributes nothing to any group
	// total (so every other assertion is unaffected) but gives the compare tooltip a zero
	// baseline, whose percent is non-computable and renders as ~
	const zeroBaseAccount = await seedAccount({
		name: 'Zero Base',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: zeroBaseAccount.id,
		owner: user.id,
		asOf: beforeTwoYears.toISOString(),
		value: 0
	});

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

	// Below the performance table, one chart per balance group charting each member account
	// or asset as its own series; excluded entities never become a series
	await expect(
		page.getByRole('heading', { name: /^(Cash|Debt|Investments|Other assets)$/ })
	).toHaveText(['Cash', 'Debt', 'Investments', 'Other assets']);
	await expect(page.getByRole('button', { name: 'Perf Test', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Perf Debt', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sold Asset', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Closed Other', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Excluded Invest' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Excluded Debt Asset' })).toHaveCount(0);

	const growthPeriodTabs = page.getByRole('tablist', { name: 'Growth period' });
	await growthPeriodTabs.getByRole('tab', { name: '2Y' }).click();
	const growthChart = page.locator('[data-growth-chart][data-chart-period="2y"]');
	await expect(growthChart).toHaveAttribute(
		'data-chart-start',
		twoYearsStart.toISOString().slice(0, 10)
	);
	await expect(growthChart).toHaveAttribute('data-chart-start-value', '22500');
	await expect(growthChart).toHaveAttribute('data-chart-end-value', '5000');

	// Wide windows downsample to weekly resolution (~105 points for 2Y instead of ~731 daily
	// rows), while 1Y and narrower keep every daily row.
	const twoYearPoints = Number(await growthChart.getAttribute('data-chart-points'));
	expect(twoYearPoints).toBeGreaterThan(90);
	expect(twoYearPoints).toBeLessThan(140);
	await growthPeriodTabs.getByRole('tab', { name: '1Y' }).click();
	await expect(page.locator('[data-growth-chart][data-chart-period="1y"]')).toHaveAttribute(
		'data-chart-points',
		/^36[67]$/
	);

	// The performance table is bounded to 5 years, but the MAX growth chart receives the
	// full-history balances, so its range start reaches the earliest seeded balance (6 years
	// back) rather than the 2Y window start.
	await growthPeriodTabs.getByRole('tab', { name: 'MAX' }).click();
	const maxChart = page.locator('[data-growth-chart][data-chart-period="max"]');
	await expect(maxChart).toHaveAttribute('data-chart-start', earliest.toISOString().slice(0, 10));
	await expect(maxChart).not.toHaveAttribute(
		'data-chart-start',
		twoYearsStart.toISOString().slice(0, 10)
	);
	// Six years of daily rows (~2,193) thin to weekly scale
	const maxPoints = Number(await maxChart.getAttribute('data-chart-points'));
	expect(maxPoints).toBeGreaterThan(250);
	expect(maxPoints).toBeLessThan(400);

	// Table columns: Group | 1W | 1M | 6M | YTD | 1Y | 2Y | 5Y | MAX | Allocation
	// Columns 1-5 (1W, 1M, 6M, YTD, 1Y) can have date collisions depending on
	// when the test runs (e.g., 1W and YTD collide in early January).
	// We only assert exact values for stable columns (2Y, 5Y, MAX) and verify
	// volatile columns render a percentage or placeholder.

	const netRow = page.getByRole('row', { name: /Net worth/ });
	const netCells = netRow.getByRole('cell');
	await expect(netCells).toHaveCount(10, { timeout: 10000 });

	// Volatile periods only need to render a percentage or placeholder.
	for (const i of [1, 2, 3, 4, 5]) {
		const cell = netCells.nth(i);
		await expect(cell.getByRole('button').or(cell.getByText('~'))).toBeVisible();
	}

	// Stable periods: exact values. Closed accounts and sold assets contribute their
	// last-known value to historical datepoints (zeroed only at/after their close/sell
	// date), so the net at every prior anchor includes Closed Other and Sold Asset.
	await expect(netCells.nth(6).getByRole('button', { name: '-77.8%' })).toBeVisible(); // 2Y
	await expect(netCells.nth(7).getByRole('button', { name: '-77.3%' })).toBeVisible(); // 5Y
	await expect(netCells.nth(8).getByRole('button', { name: '-70.6%' })).toBeVisible(); // MAX

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

	// Drag edge to edge across the MAX growth chart: nearest-point hit-testing clamps to the
	// window endpoints, so the compare tooltip shows the full-history change per series.
	// Cash went 1,000 -> 8,000 (+700%); the table's percent strings collide with the tooltip's,
	// so assertions are scoped to the tooltip via its date-range header.
	// Debt dollars are the raw balance change: -1,000 -> -3,000 is -$2,000. The percent keeps
	// the table's magnitude convention (+200%, same sign as the table's MAX cell above) and
	// is colored as bad (text-debt) because the debt grew.
	await dragChart(page, maxChart, 0, 1, 0.6, 4);
	const compareHeader = `${earliest.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
	const compareTooltip = page.getByText(compareHeader).locator('..');
	await expect(compareTooltip.getByText('+$7,000')).toBeVisible();
	await expect(compareTooltip.getByText('+700.0%')).toBeVisible();
	await expect(compareTooltip.getByText('-$2,000')).toBeVisible();
	await expect(compareTooltip.getByText('+200.0%')).toBeVisible();
	await expect(compareTooltip.getByText('+200.0%')).toHaveClass(/text-debt/);
	await expect(compareTooltip.getByText('-70.6%')).toBeVisible();

	// Releasing restores the regular hover tooltip
	await page.mouse.up();
	await expect(page.getByText(compareHeader)).not.toBeVisible();

	// Clicking a legend item isolates that series; the compare tooltip follows the
	// legend's visibility and drops the hidden series, and the y-axis rescales from the
	// full-range domain to just the visible series (cash 1,000..8,000, padded then niced
	// by the scale to 0..9,000). Tick texts are scoped to the growth chart because the
	// per-group cash chart below nices to the same $9,000 tick.
	// Narrow viewports compact axis labels above $10,000, so the top tick reads $45K there.
	const fullRangeTick = isMobile ? '$45K' : '$45,000';
	await expect(maxChart.getByText(fullRangeTick, { exact: true })).toBeVisible();
	await expect(maxChart.getByText('$9,000', { exact: true })).not.toBeVisible();
	await page.getByRole('button', { name: 'Cash', exact: true }).click();
	await expect(maxChart.getByText('$9,000', { exact: true })).toBeVisible();
	await expect(maxChart.getByText(fullRangeTick, { exact: true })).not.toBeVisible();
	// Recapture the box: the legend click can scroll the chart and stale coords miss it
	await dragChart(page, maxChart, 0, 1, 0.6, 4);
	await expect(compareTooltip.getByText('+$7,000')).toBeVisible();
	await expect(compareTooltip.getByText('Net worth')).not.toBeVisible();
	await page.mouse.up();

	// Toggling the series back restores the full-range y-axis
	await page.getByRole('button', { name: 'Cash', exact: true }).click();
	await expect(maxChart.getByText(fullRangeTick, { exact: true })).toBeVisible();
	await expect(maxChart.getByText('$9,000', { exact: true })).not.toBeVisible();

	// Each chart windows independently: switching the Cash group chart to 2Y leaves the growth
	// chart on MAX and the other group charts on their 1Y default.
	const cashChart = page.locator('[data-group-chart="cash"]');
	await expect(cashChart).toHaveAttribute('data-chart-period', '1y');
	await page.getByRole('tablist', { name: 'Cash period' }).getByRole('tab', { name: '2Y' }).click();
	await expect(cashChart).toHaveAttribute('data-chart-period', '2y');
	await expect(cashChart).toHaveAttribute(
		'data-chart-start',
		twoYearsStart.toISOString().slice(0, 10)
	);
	await expect(page.locator('[data-group-chart="debt"]')).toHaveAttribute(
		'data-chart-period',
		'1y'
	);
	await expect(maxChart).toHaveAttribute('data-chart-start', earliest.toISOString().slice(0, 10));

	// Group charts share the drag-to-compare interaction: dragging edge to edge across the
	// 2Y Cash chart compares its lone member from the window start (2,600) to today (8,000)
	await dragChart(page, cashChart, 0, 1, 0.6, 4);
	const cashCompareHeader = `${twoYearsStart.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
	const cashCompareTooltip = page.getByText(cashCompareHeader).locator('..');
	await expect(cashCompareTooltip.getByText('Perf Test')).toBeVisible();
	await expect(cashCompareTooltip.getByText('+$5,400')).toBeVisible();
	await expect(cashCompareTooltip.getByText('+207.7%')).toBeVisible();
	// Zero Base's zero baseline makes its percent non-computable, rendered as a muted ~
	await expect(cashCompareTooltip.getByText('+$0', { exact: true })).toBeVisible();
	await expect(cashCompareTooltip.getByText('~')).toHaveClass(/text-muted-foreground/);

	// Releasing dismisses the compare tooltip
	await page.mouse.up();
	await expect(page.getByText(cashCompareHeader)).not.toBeVisible();

	// The Debt group chart shows the raw balance change in dollars but keeps the performance
	// table's magnitude convention for the percent: over the 1Y window Perf Debt goes
	// -2,500 -> -3,000, which is -$500 (+20% more debt), both colored as bad (text-debt)
	const debtChart = page.locator('[data-group-chart="debt"]');
	// Mouse coordinates don't auto-scroll, and the debt chart sits below the fold on mobile
	await debtChart.scrollIntoViewIfNeeded();
	await dragChart(page, debtChart, 0, 1, 0.6, 4);
	const debtCompareHeader = `${oneYear.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
	const debtCompareTooltip = page.getByText(debtCompareHeader).locator('..');
	await expect(debtCompareTooltip.getByText('-$500')).toBeVisible();
	await expect(debtCompareTooltip.getByText('-$500')).toHaveClass(/text-debt/);
	await expect(debtCompareTooltip.getByText('+20.0%')).toBeVisible();
	await expect(debtCompareTooltip.getByText('+20.0%')).toHaveClass(/text-debt/);
	await page.mouse.up();
	await expect(page.getByText(debtCompareHeader)).not.toBeVisible();

	// Shrinking debt carries deliberately opposite signs, both colored as good (text-cash):
	// the 3M window opens at the six-month balance carried forward (-3,500) and ends at
	// today's -3,000, which is +$500 raw dollars and -14.3% by magnitude
	await page.getByRole('tablist', { name: 'Debt period' }).getByRole('tab', { name: '3M' }).click();
	await expect(debtChart).toHaveAttribute('data-chart-period', '3m');
	await dragChart(page, debtChart, 0, 1, 0.6, 4);
	const debtShrinkCompareHeader = `${threeMonths.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
	const debtShrinkCompareTooltip = page.getByText(debtShrinkCompareHeader).locator('..');
	await expect(debtShrinkCompareTooltip.getByText('+$500')).toBeVisible();
	await expect(debtShrinkCompareTooltip.getByText('+$500')).toHaveClass(/text-cash/);
	await expect(debtShrinkCompareTooltip.getByText('-14.3%')).toBeVisible();
	await expect(debtShrinkCompareTooltip.getByText('-14.3%')).toHaveClass(/text-cash/);
	await page.mouse.up();
	await expect(page.getByText(debtShrinkCompareHeader)).not.toBeVisible();
});
