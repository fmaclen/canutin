import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	DEFAULT_PASSWORD,
	getAdminPB,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedUser
} from './pocketbase.helpers';

// Sign-ups ship closed by default (users.createRule = null), so anonymous registration is
// rejected at the collection rule rather than by the form.
test('sign-ups are closed by default', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();

	await page.getByLabel('Email').fill(`closed.${Date.now()}@example.com`);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Sign up' }).click();

	await expect(page.getByText('Sign-ups are closed on this server')).toBeVisible();
	await expect(page.getByText('Account created, you can now log in')).not.toBeVisible();
});

test('expired saved session returns to login before showing financial totals', async ({ page }) => {
	const user = await seedUser('celestine');
	const sharer = await seedUser('edmund');
	const account = await seedAccount({
		name: 'Personal brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage',
		owner: user.id
	});
	const personalBalance = await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1025
	});
	const sharedAccount = await seedAccount({
		name: 'Shared checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: sharer.id
	});
	await seedAccountBalance({
		account: sharedAccount.id,
		owner: sharer.id,
		asOf: new Date().toISOString(),
		value: 4000
	});
	await seedAccountShare({
		account: sharedAccount.id,
		recipient: user.id,
		recipientEmail: user.email,
		grantedBy: sharer.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	const sharedAsset = await seedAsset({
		name: 'Shared artwork',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Artwork',
		owner: sharer.id
	});
	await seedAssetBalance({
		asset: sharedAsset.id,
		owner: sharer.id,
		asOf: new Date().toISOString(),
		marketValue: 8000
	});
	await seedAssetShare({
		asset: sharedAsset.id,
		recipient: user.id,
		recipientEmail: user.email,
		grantedBy: sharer.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	await page.goto('/');
	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$13,025');

	// A server-issued short-lived token preserves a valid signature and expires while the tab is
	// closed. Impersonation disables renewal, so this tests expiry, not normal token refreshing.
	const admin = await getAdminPB();
	const expiring = await admin.collection('users').impersonate(user.id, 1);
	await page.evaluate(
		(session) => localStorage.setItem('pocketbase_auth', JSON.stringify(session)),
		{ token: expiring.authStore.token, record: expiring.authStore.record }
	);
	const context = page.context();
	await page.close();
	await expect.poll(() => expiring.authStore.isValid).toBe(false);
	await expect(expiring.collection('users').authRefresh()).rejects.toMatchObject({ status: 401 });
	const reopened = await context.newPage();
	await reopened.goto('/');
	await expect(reopened.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
	await expect(reopened.getByRole('region', { name: 'Net worth' })).not.toBeVisible();

	for (const signal of ['visibilitychange', 'realtime']) {
		await signIn(reopened, user.email);
		await expect(reopened.getByRole('region', { name: 'Net worth' })).toContainText('$13,025');

		// A storage event updates the live SDK session as it would when another tab renews it.
		const expiringLiveSession = await admin.collection('users').impersonate(user.id, 1);
		await reopened.evaluate(
			(session) => {
				const newValue = JSON.stringify(session);
				localStorage.setItem('pocketbase_auth', newValue);
				window.dispatchEvent(new StorageEvent('storage', { key: 'pocketbase_auth', newValue }));
			},
			{ token: expiringLiveSession.authStore.token, record: expiringLiveSession.authStore.record }
		);
		await expect.poll(() => expiringLiveSession.authStore.isValid).toBe(false);

		if (signal === 'visibilitychange') {
			await reopened.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		} else {
			// The existing realtime connection can still deliver an event after the saved token expires.
			await admin.collection('accountBalances').update(personalBalance.id, { value: 2025 });
		}
		await expect(reopened.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
		await expect(reopened.getByRole('region', { name: 'Net worth' })).not.toBeVisible();
	}
});

test('returning renews a valid session once and a late renewal cannot undo logout', async ({
	page
}) => {
	const tokenLifetimeSeconds = 14 * 24 * 60 * 60;
	const user = await seedUser('odette');
	const account = await seedAccount({
		name: 'Everyday checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: user.id
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});
	// Track async visibility handlers through their full response processing, not just HTTP headers.
	await page.addInitScript(() => {
		const addEventListener = EventTarget.prototype.addEventListener;
		let pendingVisibilityHandlers = 0;
		EventTarget.prototype.addEventListener = function (
			this: EventTarget,
			type: string,
			listener: EventListenerOrEventListenerObject | null,
			options?: boolean | AddEventListenerOptions
		) {
			if (this !== document || type !== 'visibilitychange' || typeof listener !== 'function') {
				return addEventListener.call(this, type, listener, options);
			}
			return addEventListener.call(
				this,
				type,
				(event: Event) => {
					const result: unknown = listener.call(this, event);
					if (!(result instanceof Promise)) return;
					document.documentElement.dataset.pendingVisibilityHandlers = String(
						++pendingVisibilityHandlers
					);
					void result.finally(() => {
						document.documentElement.dataset.pendingVisibilityHandlers = String(
							--pendingVisibilityHandlers
						);
					});
				},
				options
			);
		};
	});
	await page.goto('/');
	const loginStartedAt = Math.floor(Date.now() / 1000);
	await signIn(page, user.email);
	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('$2,500');
	const initialToken = await page.evaluate(() => {
		const session: { token: string } = JSON.parse(localStorage.getItem('pocketbase_auth') ?? '{}');
		return session.token;
	});
	const initialClaims: { exp: number; refreshable: boolean } = JSON.parse(
		Buffer.from(initialToken.split('.')[1], 'base64url').toString()
	);
	expect(initialClaims.refreshable).toBe(true);
	expect(initialClaims.exp).toBeGreaterThanOrEqual(loginStartedAt + tokenLifetimeSeconds);
	expect(initialClaims.exp).toBeLessThanOrEqual(
		Math.floor(Date.now() / 1000) + tokenLifetimeSeconds
	);

	// JWT expiry has second precision; renewing in the issuing second can produce the same token.
	await expect
		.poll(() => Math.floor(Date.now() / 1000))
		.toBeGreaterThan(initialClaims.exp - tokenLifetimeSeconds);
	let refreshRequests = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/collections/users/auth-refresh')
			refreshRequests++;
	});
	const renewalStartedAt = Math.floor(Date.now() / 1000);
	const renewalResponse = page.waitForResponse('**/api/collections/users/auth-refresh');
	await page.evaluate(() => {
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('online'));
	});
	const renewed: { token: string } = await (await renewalResponse).json();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const session: { token: string } = JSON.parse(
					localStorage.getItem('pocketbase_auth') ?? '{}'
				);
				return session.token;
			})
		)
		.toBe(renewed.token);
	const renewedClaims: { exp: number; refreshable: boolean } = JSON.parse(
		Buffer.from(renewed.token.split('.')[1], 'base64url').toString()
	);
	expect(renewed.token).not.toBe(initialToken);
	expect(renewedClaims.refreshable).toBe(true);
	expect(renewedClaims.exp).toBeGreaterThanOrEqual(renewalStartedAt + tokenLifetimeSeconds);
	expect(renewedClaims.exp).toBeLessThanOrEqual(
		Math.floor(Date.now() / 1000) + tokenLifetimeSeconds
	);
	expect(refreshRequests).toBe(1);
	await expect(netWorth).toContainText('$2,500');

	// Hold a real successful response until after logout to exercise the credential commit race.
	let releaseRefresh = () => {};
	const refreshGate = new Promise<void>((resolve) => {
		releaseRefresh = resolve;
	});
	await page.route('**/api/collections/users/auth-refresh', async (route) => {
		const response = await route.fetch();
		await refreshGate;
		await route.fulfill({ response });
	});
	const pendingRenewal = page.waitForRequest('**/api/collections/users/auth-refresh');
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await pendingRenewal;
	await expect
		.poll(() =>
			page.evaluate(() => Number(document.documentElement.dataset.pendingVisibilityHandlers))
		)
		.toBeGreaterThan(0);
	const logoutButton = page.getByRole('button', { name: 'Log out', exact: true });
	if (!(await logoutButton.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(logoutButton).toBeVisible();
	}
	await logoutButton.click();
	await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();

	const lateResponse = page.waitForResponse('**/api/collections/users/auth-refresh');
	releaseRefresh();
	await lateResponse;
	await expect
		.poll(() => page.evaluate(() => document.documentElement.dataset.pendingVisibilityHandlers))
		.toBe('0');
	await expect.poll(() => page.evaluate(() => localStorage.getItem('pocketbase_auth'))).toBeNull();
	await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
	await expect(netWorth).not.toBeVisible();
});
