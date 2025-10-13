import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('shows connection error toast when PocketBase is unreachable', async ({ page }) => {
	const user = await seedUser('charlie');

	await page.goto('/');
	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();
	await expect(page.getByText("Can't connect to the database server")).not.toBeVisible();

	await page.route('**/api/collections/**', (route) => {
		route.abort('failed');
	});

	await page.reload();
	await expect(
		page.locator('[data-sonner-toast]', {
			hasText: "Can't connect to the database server"
		})
	).toBeVisible();
});

test('shows subscription error toast when realtime subscription fails', async ({ page }) => {
	const user = await seedUser('dave');

	await page.goto('/');

	await page.route('**/api/realtime', (route) => {
		route.abort('failed');
	});

	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();
	await expect(
		page.locator('[data-sonner-toast]', {
			hasText: 'Lost connection to live updates'
		})
	).toBeVisible();
});

test('shows auth error toast when session expires', async ({ page }) => {
	const user = await seedUser('eve');

	await page.goto('/');
	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();
	await expect(page.getByText('Your session has expired')).not.toBeVisible();

	await page.route('**/api/collections/**', (route) => {
		route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 401,
				message: 'The request requires valid record authorization token to be set.',
				data: {}
			})
		});
	});

	await page.reload();
	await expect(
		page.locator('[data-sonner-toast]', {
			hasText: 'Your session has expired'
		})
	).toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page).toHaveURL('/auth');
});
