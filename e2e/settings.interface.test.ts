import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedCurrency, seedUser } from './pocketbase.helpers';

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

	await expect(page.getByText('Interface')).toBeVisible();
	await expect(page.getByText('Interfaz')).not.toBeVisible();

	const saveButton = page.getByRole('button', { name: 'Save' });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await expect(page.getByText('Configuración actualizada')).toBeVisible();
	await expect(page.getByText('Interface')).not.toBeVisible();
	await expect(page.getByText('Interfaz')).toBeVisible();
	await expect(page.getByLabel('Idioma')).toContainText('Español');
	await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();

	await goToPageViaSidebar(page, 'Imports');
	await expect(page.getByText('Agentes de IA', { exact: true })).toBeVisible();

	await page.reload();
	await expect(page.getByText('Agentes de IA', { exact: true })).toBeVisible();

	await goToPageViaSidebar(page, 'Settings');
	await expect(page.getByText('Interfaz')).toBeVisible();
	await expect(page.getByLabel('Idioma')).toContainText('Español');
});

test('settings switches theme only after clicking Save and persists after reload', async ({
	page
}) => {
	const user = await seedUser('imani');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('AI agents')).toBeVisible();
	await expect(page.getByLabel('Instructions URL')).toHaveValue(/\/api\/canutin\/skill$/);

	await goToPageViaSidebar(page, 'Settings');

	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

	await page.getByLabel('Theme').click();
	await page.getByRole('option', { name: 'Dark' }).click();

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

test('settings exposes default currency without the old exchange-rate toggle', async ({ page }) => {
	const user = await seedUser('diego');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('Interface')).toBeVisible();
	await expect(page.getByLabel('Default currency')).toContainText('USD');
	await expect(page.getByText('Exchange rates', { exact: true })).toHaveCount(0);
	await expect(page.getByText('About', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Version')).toHaveValue(/^v\d+\.\d+\.\d+/);
});

test('settings switches display currency only after clicking Save and persists after reload', async ({
	page
}) => {
	const user = await seedUser('cyrus');
	await seedCurrency({ owner: user.id, code: 'EUR', name: 'Euro', autoUpdate: false });

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	const defaultCurrency = page.getByLabel('Default currency');
	await expect(defaultCurrency).toContainText('USD');
	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

	await defaultCurrency.click();
	await page.getByRole('option', { name: /EUR\s+Euro/ }).click();

	await expect(defaultCurrency).toContainText('EUR');
	await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

	await page.reload();

	await expect(defaultCurrency).toContainText('USD');

	await defaultCurrency.click();
	await page.getByRole('option', { name: /EUR\s+Euro/ }).click();
	const saveButton = page.getByRole('button', { name: 'Save' });
	await saveButton.click();

	await expect(page.getByText('Settings updated')).toBeVisible();
	await expect(defaultCurrency).toContainText('EUR');
	await expect(saveButton).toBeDisabled();

	await page.reload();

	await expect(defaultCurrency).toContainText('EUR');
});

test('locale defaults from browser locale when supported and falls back to English', async ({
	browser
}) => {
	const spanishContext = await browser.newContext({ locale: 'es-MX' });
	const spanishPage = await spanishContext.newPage();

	// Test's explicit purpose is direct-URL locale-detection behavior on first load
	await spanishPage.goto('/auth');

	await expect(spanishPage.getByRole('button', { name: 'Log in' })).not.toBeVisible();
	await expect(spanishPage.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
	await expect(spanishPage.getByText('Probar la demo')).toBeVisible();

	await spanishContext.close();

	const fallbackContext = await browser.newContext({ locale: 'fr-CA' });
	const fallbackPage = await fallbackContext.newPage();

	// Test's explicit purpose is direct-URL locale-detection behavior on first load
	await fallbackPage.goto('/auth');

	await expect(fallbackPage.getByRole('button', { name: 'Iniciar sesión' })).not.toBeVisible();
	await expect(fallbackPage.getByRole('button', { name: 'Log in' })).toBeVisible();
	await expect(fallbackPage.getByText('Try the demo')).toBeVisible();

	await fallbackContext.close();
});
