import { expect, test } from '@playwright/test';

import { goToPageViaSidebar } from './playwright.helpers';

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
