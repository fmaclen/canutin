import { expect, test } from '@playwright/test';

import { PB_URL } from './pocketbase.helpers';

test('skill route serves live markdown schema reference', async () => {
	const response = await fetch(`${PB_URL}/api/canutin/skill`);
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toContain('text/markdown');

	const body = await response.text();
	expect(body.startsWith('---\nname: skill')).toBe(true);
	expect(body).toContain('### accounts');

	const accountsSection = body.slice(body.indexOf('### accounts'));
	const nameRow = accountsSection.split('\n').find((line) => line.startsWith('| name |'));
	expect(nameRow).toContain('| name | text |');
});
