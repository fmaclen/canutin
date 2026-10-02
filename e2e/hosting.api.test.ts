import { expect, test } from '@playwright/test';

import { PB_URL } from './pocketbase.helpers';

test('PocketBase keeps API, admin and asset paths separate from the app fallback', async () => {
	const config = await fetch(`${PB_URL}/api/canutin/config`);
	expect(config.status).toBe(200);
	expect(await config.json()).toMatchObject({
		setupReady: true,
		demoEnabled: true,
		plausibleDomain: expect.any(String),
		plausibleScriptUrl: expect.any(String)
	});

	const app = await fetch(PB_URL);
	const immutablePath = (await app.text()).match(/href="([^"]*\/_app\/immutable\/[^"]+)"/)?.[1];
	if (!immutablePath) throw new Error('Built app has no immutable asset');
	const asset = await fetch(new URL(immutablePath, PB_URL));
	expect(asset.status).toBe(200);
	expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

	const adminRedirect = await fetch(`${PB_URL}/_`, { redirect: 'manual' });
	expect(adminRedirect.status).toBe(307);
	expect(adminRedirect.headers.get('location')).toBe('/_/');

	const admin = await fetch(`${PB_URL}/_/`);
	expect(admin.status).toBe(200);
	expect(await admin.text()).toContain('PocketBase');

	for (const path of ['/api/does-not-exist', '/_app/immutable/missing.js', '/missing.css']) {
		const missing = await fetch(`${PB_URL}${path}`);
		expect(missing.status).toBe(404);
		expect(missing.headers.get('content-type')).not.toContain('text/html');
		expect(missing.headers.get('cache-control') ?? '').not.toContain('immutable');
	}
});
