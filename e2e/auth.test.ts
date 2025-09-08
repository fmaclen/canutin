import { expect, test } from '@playwright/test';

test('user can sign up, login and logout', async ({ page, context }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByText('Failed to authenticate')).not.toBeVisible();

	const uniqueEmail = `alice+${Date.now()}@example.com`;

	// Try to login before signing up
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password', { exact: true }).fill('123qweasdzxc');
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByText('Failed to authenticate')).toBeVisible();

	// Sign up
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
	await expect(page.getByText('Failed to create record')).not.toBeVisible();

	// Enter incorrect password confirmation
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password', { exact: true }).fill('123qweasdzxc');
	await page.getByLabel('Confirm password').fill('NOT_123qweasdzxc1');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Failed to create record')).toBeVisible();

	// Enter correct password confirmation
	await page.getByLabel('Confirm password').fill('123qweasdzxc');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Your account has been created, you can now log in')).toBeVisible();
	await expect(page.getByText('Failed to create record')).not.toBeVisible();

	// It redirects back to login
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).not.toBeVisible();

	// Login
	await page.getByLabel('Email').fill(uniqueEmail);
	await page.getByLabel('Password').fill('123qweasdzxc');
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Log out' })).not.toBeVisible();

	// Logout
	const userButton = page.getByRole('button', { name: 'alice' });
	if (!(await userButton.isVisible())) {
		// On mobile the sidebar is collapsed; open it first
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(userButton).toBeVisible();
	}
	await userButton.click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();
	await expect(page.getByRole('link', { name: 'Toggle Sidebar' })).not.toBeVisible();
});
