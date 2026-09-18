import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

// Playwright has no touch-drag primitive, so the touch is fed to the page as bare events carrying
// only the fields the component reads
async function touch(target: Locator, type: 'touchstart' | 'touchend') {
	await target.evaluate((element, type) => {
		const event = new Event(type, { bubbles: true });
		Object.defineProperty(event, 'touches', { value: type === 'touchstart' ? [{}] : [] });
		element.dispatchEvent(event);
	}, type);
}

// Mimics iOS stretching the page past its top: a negative scroll position reported by a scroll
// event while the finger is still down
async function overscroll(page: Page, depth: number) {
	await page.evaluate((depth) => {
		Object.defineProperty(window, 'scrollY', { value: -depth, configurable: true });
		window.dispatchEvent(new Event('scroll'));
	}, depth);
}

test('pulling the page down in standalone mode reloads it past the threshold', async ({ page }) => {
	const user = await seedUser('nico');
	// Neither browser project runs as an installed app, so the standalone query is answered by
	// hand; every other query still reaches the browser
	await page.addInitScript(() => {
		const matchMedia = window.matchMedia.bind(window);
		window.matchMedia = (query: string) => {
			const list = matchMedia(query);
			if (query === '(display-mode: standalone)') {
				Object.defineProperty(list, 'matches', { value: true });
			}
			return list;
		};
	});
	await page.goto('/');
	await signIn(page, user.email);
	// The marker only survives until the document is replaced, which is how a reload is told
	// apart from no reload
	await page.evaluate(() => Object.assign(window, { pullMarker: true }));
	const heading = page.getByRole('heading', { name: 'The big picture', exact: true });
	const indicator = page.locator('[data-slot="pull-to-reload"]');
	await expect(indicator).toBeHidden();

	// A short pull shows the indicator, then lets go before the threshold
	await touch(heading, 'touchstart');
	await overscroll(page, 40);
	await expect(indicator).toBeVisible();
	await expect(indicator).toHaveAttribute('data-state', 'pulling');

	await touch(heading, 'touchend');
	await expect(indicator).toBeHidden();
	expect(await page.evaluate(() => 'pullMarker' in window)).toBe(true);

	// A deep pull arms, and only releasing it reloads the page
	await touch(heading, 'touchstart');
	await overscroll(page, 120);
	await expect(indicator).toHaveAttribute('data-state', 'armed');
	expect(await page.evaluate(() => 'pullMarker' in window)).toBe(true);

	await Promise.all([page.waitForEvent('load'), touch(heading, 'touchend')]);
	await expect(heading).toBeVisible();
	expect(await page.evaluate(() => 'pullMarker' in window)).toBe(false);
});
