import PocketBase from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { env } from '$env/dynamic/public';

import type { TypedPocketBase } from './pocketbase.schema';

export class PocketBaseClientContext {
	client: TypedPocketBase;

	constructor() {
		this.client = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');
	}
}

const CONTEXT_KEY = 'pocketbase-client';

export function setPocketBaseClientContext() {
	const store = new PocketBaseClientContext();
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getPocketBaseClientContext() {
	const store = getContext<PocketBaseClientContext>(CONTEXT_KEY);
	if (!store)
		throw new Error(
			'PocketBase client context not found. Call setPocketBaseClientContext() first.'
		);
	return store;
}
