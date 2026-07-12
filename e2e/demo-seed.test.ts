import { expect, test } from '@playwright/test';

import { goToPageViaSidebar } from './playwright.helpers';
import { DEMO_EMAIL, getUserPB, seedDemoAccount } from './pocketbase.helpers';

test('/demo auto-logs into the seeded demo account and displays net worth', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Try as guest' })).toBeVisible();

	await page.getByRole('link', { name: 'Try as guest' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Try as guest' })).not.toBeVisible();

	await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$185,787');
	await expect(page.getByRole('region', { name: 'Cash' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Investments' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Debt' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Other assets' })).toBeVisible();

	await goToPageViaSidebar(page, 'Trades');
	await expect(page.getByText('Sold GameStop')).toBeVisible();
	await expect(page.getByText('Bought SPDR S&P 500').first()).toBeVisible();
	await expect(page.getByText('Bought Bitcoin').first()).toBeVisible();
	await expect(page.getByText('Bought Ethereum').first()).toBeVisible();

	await goToPageViaSidebar(page, 'Portfolio');
	await expect(page.getByText('SPDR S&P 500 ETF Trust')).toBeVisible();
	await expect(page.getByText('Bitcoin')).toBeVisible();
});

test('the seeded demo GameStop position folds its trades into a realistic cost basis', async () => {
	const demoPB = await getUserPB(DEMO_EMAIL);
	const gameStop = await demoPB.collection('securities').getFirstListItem('name = "GameStop"');
	const balances = await demoPB.collection('securityBalances').getFullList({
		filter: `security = "${gameStop.id}"`,
		sort: '-asOf'
	});

	// The GameStop series (buy 200, sell 100, buy 25) only lands on 4700 when folded oldest-first;
	// a newest-first fold drives quantity negative on the sell and yields 5900.
	expect(balances.length).toBeGreaterThan(0);
	expect(balances[0].costBasis).toBe(4700);
});

test('resetting the demo account preserves its owner-scoped exchange rates', async () => {
	const demoPB = await getUserPB(DEMO_EMAIL);
	// The demo owns manual ARS quotes; the exchangeRates listRule also exposes global rows
	// (owner = ''), so filtering on "owner != ''" leaves only the demo user's own rates.
	const ownedArsRates = () =>
		demoPB.collection('exchangeRates').getFullList({ filter: 'currency = "ARS" && owner != ""' });

	const before = await ownedArsRates();
	expect(before.length).toBeGreaterThan(0);
	const beforeIds = new Set(before.map((rate) => rate.id));

	// Re-run the demoReset cron: wipeDemoData deletes the demo-owned rows (currencies are kept)
	// and seedDemoData recreates them. The currency-delete hook must not cascade the owned ARS
	// quotes away during the reset, so the count returns unchanged once fresh rows have committed.
	await seedDemoAccount();
	await expect
		.poll(
			async () => {
				const rates = await ownedArsRates();
				const regenerated = rates.every((rate) => !beforeIds.has(rate.id));
				return regenerated ? rates.length : -1;
			},
			// A full demo reseed writes thousands of rows; match seedDemoAccount's own polling budget.
			{ timeout: 30_000 }
		)
		.toBe(before.length);
});
