import { json } from '@sveltejs/kit';

import { revertImport } from '$lib/server/import';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
	}

	const token = authHeader.slice(7);

	let body: { sessionId?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.sessionId || typeof body.sessionId !== 'string') {
		return json({ error: 'sessionId is required' }, { status: 400 });
	}

	try {
		const result = await revertImport(body.sessionId, token);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Revert failed';
		const status = message === 'Unauthorized' ? 403 : message.includes('already') ? 409 : 500;
		return json({ error: message }, { status });
	}
};
