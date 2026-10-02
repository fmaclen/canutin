import { error } from '@sveltejs/kit';

import { dev } from '$app/environment';

export function load() {
	// Only allow routes in this group during development or testing
	if (!dev && import.meta.env.PUBLIC_PLAYWRIGHT_TESTING !== 'true') {
		error(404, 'Not found');
	}
}
