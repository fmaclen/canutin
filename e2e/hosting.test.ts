import { expect, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('PocketBase serves direct app URLs and preserves login across reloads', async ({ page }) => {
	const user = await seedUser('rosemary');
	const apiRequests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
	});

	// A fresh visit to a protected deep link must serve the app and reach the login form.
	await page.goto('/settings/imports');
	await expect(page).toHaveURL('/auth');
	await signIn(page, user.email);
	await expect(page).toHaveURL('/big-picture');

	// A signed-in direct visit exercises PocketBase's fallback without client-side navigation.
	await page.goto('/settings/imports');
	await expect(page.getByLabel('Instructions URL')).toBeVisible();
	await page.reload();
	await expect(page).toHaveURL('/settings/imports');
	await expect(page.getByLabel('Instructions URL')).toBeVisible();

	await page.getByRole('link', { name: 'General', exact: true }).click();
	await expect(page).toHaveURL('/settings');
	await expect(page.getByText('Interface', { exact: true })).toBeVisible();
	expect(apiRequests.some((url) => new URL(url).pathname.endsWith('/auth-with-password'))).toBe(
		true
	);
	expect(apiRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});
