import { expect, test } from '@playwright/test';

test('demo link is visible on login page and starts demo flow', async ({ page }) => {
	await page.goto('/auth');

	await expect(page.getByRole('link', { name: 'Try as guest' })).toBeVisible();

	await page.getByRole('link', { name: 'Try as guest' }).click();

	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();

	await page.goto('/demo');

	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
});
