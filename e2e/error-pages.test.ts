import { expect, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('displays error 404 page when visiting non-existent route', async ({ page }) => {
	const user = await seedUser('dimitri');

	await page.goto('/');
	await expect(page).toHaveURL('/auth');

	await page.goto('/this-route-does-not-exist');
	await expect(page).toHaveURL('/auth');

	await signIn(page, user.email);
	await expect(page).toHaveURL('/big-picture');

	await page.goto('/this-route-does-not-exist');
	await expect(page).toHaveURL('/this-route-does-not-exist');
	await expect(page.getByText('Error 404')).toBeVisible();
	await expect(page.getByText('Not Found')).toBeVisible();
});

test('displays error 500 page when server error occurs', async ({ page }) => {
	const user = await seedUser('raj');

	await page.goto('/');
	await expect(page).toHaveURL('/auth');

	await signIn(page, user.email);
	await expect(page).toHaveURL('/big-picture');
	await expect(page.getByText('Error 500')).not.toBeVisible();

	await page.goto('/dev/error-500');
	await expect(page).toHaveURL('/dev/error-500');
	await expect(page.getByText('Error 500')).toBeVisible();
	await expect(page.getByText('Test server error for playwright')).toBeVisible();
});
