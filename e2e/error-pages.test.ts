import { expect, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('displays error 404 page when visiting non-existent route', async ({ page }) => {
	const user = await seedUser('dimitri');

	await page.goto('/');
	await expect(page).toHaveURL('/auth');

	// Intentionally visiting a broken URL the UI never links to, to verify the
	// unauthenticated auth-guard redirect wins over the 404 page
	await page.goto('/this-route-does-not-exist');
	await expect(page).toHaveURL('/auth');

	await signIn(page, user.email);
	await expect(page).toHaveURL('/big-picture');

	// Explicit purpose of this test is direct-URL 404 behavior for a route the UI never links to
	await page.goto('/this-route-does-not-exist');
	await expect(page).toHaveURL('/this-route-does-not-exist');
	await expect(page.getByText('404', { exact: true })).toBeVisible();
	await expect(page.getByText("There's nothing at this address")).toBeVisible();
	await expect(page.getByRole('link', { name: 'go back' })).toBeVisible();
});

test('displays error 500 page when server error occurs', async ({ page }) => {
	const user = await seedUser('raj');

	await page.goto('/');
	await expect(page).toHaveURL('/auth');

	await signIn(page, user.email);
	await expect(page).toHaveURL('/big-picture');
	await expect(page.getByText('500', { exact: true })).not.toBeVisible();

	// Explicit purpose of this test is direct-URL 500 behavior; the dev-only error route
	// has no UI link
	await page.goto('/dev/error-500');
	await expect(page).toHaveURL('/dev/error-500');
	await expect(page.getByText('500', { exact: true })).toBeVisible();
	await expect(page.getByText('Test server error for playwright')).toBeVisible();
});
