import { expect, Locator, Page } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

export async function getRowIndex(rows: Locator, name: string) {
	return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
}

export function formatDateForInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

export async function signIn(page: Page, email: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
}

export async function signOut(page: Page, userLabel: string) {
	const userButton = page.getByRole('button', { name: userLabel });
	if (!(await userButton.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(userButton).toBeVisible();
	}
	await userButton.click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
}

export async function goToPageViaSidebar(page: Page, label: string) {
	const sidebar = page.getByLabel('Sidebar');
	const link = sidebar.getByRole('link', { name: label });
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
