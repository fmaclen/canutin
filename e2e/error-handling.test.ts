import { expect, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('shows connection error toast when PocketBase is unreachable', async ({ page }) => {
	const user = await seedUser('charlie');

	await page.goto('/');
	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();
	await expect(page.getByText("Can't connect to the Canutin server")).not.toBeVisible();

	// Block all PocketBase requests to simulate server going down
	await page.route('**/api/collections/**', (route) => {
		route.abort('failed');
	});

	await page.reload();
	await expect(
		page.locator('[data-sonner-toast]', {
			hasText: "Can't connect to the Canutin server"
		})
	).toBeVisible();
});

test('shows subscription error toast when realtime subscription fails', async ({ page }) => {
	const user = await seedUser('dave');

	await page.goto('/');

	// Block realtime endpoint to make subscription fail
	await page.route('**/api/realtime', (route) => {
		route.abort('failed');
	});

	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();

	// Wait for subscription error toast to appear
	await expect(
		page.locator('[data-sonner-toast]', {
			hasText: 'Lost connection to live updates'
		})
	).toBeVisible();
});
