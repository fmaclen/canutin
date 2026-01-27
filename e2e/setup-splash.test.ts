import { expect, test } from '@playwright/test';

test('shows splash screen when setup is needed', async ({ page }) => {
	await page.route('**/api/setup-status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ ready: false })
		})
	);
	await page.goto('/');
	await expect(page.getByText('Setup required')).toBeVisible();
	await expect(page.getByText('Check your server logs')).toBeVisible();
});

test('shows error when backend is unreachable', async ({ page }) => {
	await page.route('**/api/setup-status', (route) => route.abort());
	await page.goto('/');
	await expect(page.getByText("Can't connect")).toBeVisible();
});
