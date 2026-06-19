import { expect, test } from '@playwright/test';

test('/demo route seeds data and displays net worth', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Try as guest' })).toBeVisible();

	await page.goto('/demo');
	await expect(page.getByRole('link', { name: 'Try as guest' })).not.toBeVisible();

	// Verify seeding completed with deterministic net worth
	await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$184,719', {
		timeout: 60_000
	});
	await expect(page.getByRole('region', { name: 'Cash' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Investments' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Debt' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Other assets' })).toBeVisible();

	// Seeded trades are visible under the default "last 3 months" filter
	await page.goto('/trades');
	await expect(page.getByText('Sold GameStop')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('Bought SPDR S&P 500').first()).toBeVisible();
	await expect(page.getByText('Bought Bitcoin').first()).toBeVisible();
	await expect(page.getByText('Bought Ethereum').first()).toBeVisible();

	// Portfolio shows the seeded holdings
	await page.goto('/portfolio');
	await expect(page.getByText('SPDR S&P 500 ETF Trust')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('Bitcoin')).toBeVisible();
});
