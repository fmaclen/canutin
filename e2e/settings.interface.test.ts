import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

test('settings switches language only after clicking Save and persists after reload', async ({
	page
}) => {
	const user = await seedUser('beatrice');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('Interfaz')).not.toBeVisible();
	await expect(page.getByText('Interface')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

	await page.getByLabel('Language').click();
	await page.getByRole('option', { name: 'Español', exact: true }).click();

	// Selecting a new value must NOT apply the change yet.
	await expect(page.getByText('Interface')).toBeVisible();
	await expect(page.getByText('Interfaz')).not.toBeVisible();

	const saveButton = page.getByRole('button', { name: 'Save' });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	// After saving, the UI (and the toast) render in the newly selected language.
	await expect(page.getByText('Configuración actualizada')).toBeVisible();
	await expect(page.getByText('Interface')).not.toBeVisible();
	await expect(page.getByText('Interfaz')).toBeVisible();
	await expect(page.getByLabel('Idioma')).toContainText('Español');
	await expect(page.getByText('Importaciones', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();

	await page.reload();

	await expect(page.getByText('Interfaz')).toBeVisible();
	await expect(page.getByLabel('Idioma')).toContainText('Español');
	await expect(page.getByText('Importaciones', { exact: true })).toBeVisible();
});

test('settings switches theme only after clicking Save and persists after reload', async ({
	page
}) => {
	const user = await seedUser('imani');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	await expect(page.getByText('AI agent access')).toBeVisible();
	await expect(page.getByLabel('URL')).toHaveValue(/\/api\/canutin\/skill$/);

	await page.getByLabel('Theme').click();
	await page.getByRole('option', { name: 'Dark' }).click();

	// Selecting a new value must NOT apply the change yet.
	await expect(page.locator('html')).not.toHaveClass(/dark/);

	const saveButton = page.getByRole('button', { name: 'Save' });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await expect(page.getByText('Settings updated')).toBeVisible();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByLabel('Theme')).toContainText('Dark');
	await expect(saveButton).toBeDisabled();

	await page.reload();

	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByLabel('Theme')).toContainText('Dark');
});

test('locale defaults from browser locale when supported and falls back to English', async ({
	browser
}) => {
	const spanishContext = await browser.newContext({ locale: 'es-MX' });
	const spanishPage = await spanishContext.newPage();

	await spanishPage.goto('/demo/paraglide');

	await expect(spanishPage.getByText('Personal finance platform')).not.toBeVisible();
	await expect(spanishPage.getByText('Plataforma de finanzas personales')).toBeVisible();

	await spanishContext.close();

	const fallbackContext = await browser.newContext({ locale: 'fr-CA' });
	const fallbackPage = await fallbackContext.newPage();

	await fallbackPage.goto('/demo/paraglide');

	await expect(fallbackPage.getByText('Plataforma de finanzas personales')).not.toBeVisible();
	await expect(fallbackPage.getByText('Personal finance platform')).toBeVisible();

	await fallbackContext.close();
});
