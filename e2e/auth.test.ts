import { readdirSync, rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { DEFAULT_PASSWORD, getAdminPB } from './pocketbase.helpers';

const MIGRATIONS_DIR = 'pocketbase/pb_migrations';

test('sign-ups are closed by default; sign up, login and logout when enabled', async ({ page }) => {
	const pbAdmin = await getAdminPB();
	const original = (await pbAdmin.collections.getOne('users')).createRule;
	expect(original).toBeNull();

	const migrationsBefore = new Set(readdirSync(MIGRATIONS_DIR));
	await pbAdmin.collections.update('users', { createRule: '' });

	try {
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
	} finally {
		await pbAdmin.collections.update('users', { createRule: null });
		// Toggling createRule auto-generates migration files; drop the open/close artifacts.
		for (const file of readdirSync(MIGRATIONS_DIR)) {
			if (!migrationsBefore.has(file)) rmSync(`${MIGRATIONS_DIR}/${file}`);
		}
	}
});
