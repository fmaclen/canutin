import { json } from '@sveltejs/kit';

import { processImport, type ImportPayload } from '$lib/server/import';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
	}

	const token = authHeader.slice(7);

	let payload: ImportPayload;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!payload.sessionLabel || typeof payload.sessionLabel !== 'string') {
		return json({ error: 'sessionLabel is required' }, { status: 400 });
	}

	if (!payload.accounts && !payload.assets && !payload.transactions) {
		return json(
			{ error: 'At least one of accounts, assets, or transactions is required' },
			{ status: 400 }
		);
	}

	try {
		const result = await processImport(payload, token);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Import failed';
		return json({ error: message }, { status: 500 });
	}
};
