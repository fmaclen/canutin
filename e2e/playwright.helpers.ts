import { expect, Page } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

export async function signIn(page: Page, email: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
}

export async function goToPageViaSidebar(page: Page, label: string) {
	const link = page.getByRole('link', { name: label });
	// On mobile the sidebar is collapsed; open it first
	if (!(await link.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(link).toBeVisible();
	}
	await link.click();
	// HACK: press ESC to close the sidebar
	// Ideally the sidebar would close automatically when the link is clicked (on mobile)
	await page.keyboard.press('Escape');
}
