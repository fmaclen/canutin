import { expect, Page } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

export const signIn = async (page: Page, email: string) => {
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
};
