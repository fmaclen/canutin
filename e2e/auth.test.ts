import { expect, test } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

// Sign-ups ship closed by default (users.createRule = null), so anonymous registration is
// rejected at the collection rule rather than by the form.
test('sign-ups are closed by default', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();

	await page.getByLabel('Email').fill(`closed.${Date.now()}@example.com`);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Sign up' }).click();

	await expect(page.getByText('Sign-ups are closed on this server')).toBeVisible();
	await expect(page.getByText('Account created, you can now log in')).not.toBeVisible();
});
