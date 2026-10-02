import type { LayoutLoad } from './$types';

export const ssr = false;

export const load = (async ({ fetch }) => {
	const response = await fetch('/api/canutin/config');
	if (!response.ok) throw new Error('Unable to load app configuration');

	const config: unknown = await response.json();
	if (
		typeof config !== 'object' ||
		config === null ||
		!('demoEnabled' in config) ||
		typeof config.demoEnabled !== 'boolean' ||
		!('plausibleDomain' in config) ||
		typeof config.plausibleDomain !== 'string' ||
		!('plausibleScriptUrl' in config) ||
		typeof config.plausibleScriptUrl !== 'string' ||
		!('setupReady' in config) ||
		typeof config.setupReady !== 'boolean'
	) {
		throw new Error('Invalid app configuration');
	}

	return {
		config: {
			demoEnabled: config.demoEnabled,
			plausibleDomain: config.plausibleDomain,
			plausibleScriptUrl: config.plausibleScriptUrl,
			setupReady: config.setupReady
		}
	};
}) satisfies LayoutLoad;
