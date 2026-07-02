import { browser } from '$app/environment';
import { getBackendUrl } from '$lib/pocketbase-url';

export function load() {
	if (browser) {
		window.location.replace(`${getBackendUrl()}/api/canutin/skill`);
	}
}
