import PocketBase from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { env } from '$env/dynamic/public';

import type { TypedPocketBase } from './pocketbase.schema';

export class PocketBaseContext {
	authedClient: TypedPocketBase;

	constructor() {
		this.authedClient = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');
	}
}

const CONTEXT_KEY = 'pocketbase-client';

export function setPocketBaseContext() {
	const store = new PocketBaseContext();
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getPocketBaseContext() {
	const store = getContext<PocketBaseContext>(CONTEXT_KEY);
	if (!store)
		throw new Error(
			'PocketBase client context not found. Call setPocketBaseContext() first.'
		);
	return store;
}
