import { error } from '@sveltejs/kit';

export function load() {
	error(500, 'Test server error for playwright');
}
