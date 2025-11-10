import { expect, test } from '@playwright/test';

test('paraglide demo switches language', async ({ page, context }) => {
	await context.clearCookies();
	await page.goto('/demo/paraglide');

	await expect(page.getByText('Plataforma de finanzas personales')).not.toBeVisible();
	await expect(page.getByText('Personal finance platform')).toBeVisible();

	await Promise.all([
		page.waitForLoadState('domcontentloaded'),
		page.getByRole('button', { name: 'es' }).click()
	]);
	await expect(page.getByText('Personal finance platform')).not.toBeVisible();
	await expect(page.getByText('Plataforma de finanzas personales')).toBeVisible();

	await Promise.all([
		page.waitForLoadState('domcontentloaded'),
		page.getByRole('button', { name: 'en' }).click()
	]);
	await expect(page.getByText('Plataforma de finanzas personales')).not.toBeVisible();
	await expect(page.getByText('Personal finance platform')).toBeVisible();
});
