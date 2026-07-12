import { expect, test } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

test('sign-ups are closed by default', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

	await page.getByLabel('Email').fill(`closed.${Date.now()}@example.com`);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page.getByText('Only superusers can perform this action.')).toBeVisible();
	await expect(page.getByText('Account created, you can now log in')).not.toBeVisible();
});

// Skipped: sign-ups ship closed by default (users.createRule = null), so anonymous
// registration is rejected and this flow can't run as-is. Re-enable once the test
// environment can create a user with sign-ups closed - by opening the create rule for
// the run, or via a privileged demo/test user-creation path. The demo-seed test is
// punted for the same reason.
test.skip('sign up, login and logout', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByText('Failed to authenticate')).not.toBeVisible();

	const uniqueEmail = `bob.${Date.now()}@example.com`;

	// Try to login before signing up
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByText('Failed to authenticate')).toBeVisible();

	// Sign up
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
	await expect(page.getByText('Failed to create record')).not.toBeVisible();

	// Enter incorrect password confirmation
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByLabel('Confirm password').fill('NOT_' + DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Failed to create record')).toBeVisible();

	// Enter correct password confirmation
	await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Account created, you can now log in')).toBeVisible();
	await expect(page.getByText('Failed to create record')).not.toBeVisible();

	// It redirects back to login
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).not.toBeVisible();

	// Login
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();

	// Logout
	const logoutButton = page.getByRole('button', { name: 'Log out' });
	if (!(await logoutButton.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(logoutButton).toBeVisible();
	}
	await logoutButton.click();
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();
	await expect(page.getByRole('link', { name: 'Toggle Sidebar' })).not.toBeVisible();
});
