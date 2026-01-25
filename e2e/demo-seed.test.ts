import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { seedDemoData } from '../src/lib/demo/seed';
import type { TypedPocketBase } from '../src/lib/pocketbase.schema';
import { DEFAULT_PASSWORD, seedUser } from './pocketbase.helpers';

const PB_URL = 'http://127.0.0.1:42070';

test('seedDemoData populates expected net worth', async ({ page }) => {
	const user = await seedUser('seed-test');
	const pb = new PocketBase(PB_URL) as TypedPocketBase;
	await pb.collection('users').authWithPassword(user.email, DEFAULT_PASSWORD);

	await seedDemoData(pb, user.id);

	await page.goto('/');
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();

	await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$184,719');
});
