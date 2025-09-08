<script lang="ts">
	import '../app.css';

	import PocketBase from 'pocketbase';

	import { env } from '$env/dynamic/public';
	import favicon from '$lib/assets/favicon.svg';
	import { getAuthContext, setAuthContext } from '$lib/auth.svelte';

	import AuthGuard from './auth-guard.svelte';

	let { children } = $props();

	const pb = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');

	setAuthContext(pb);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<AuthGuard>
	{@render children?.()}
</AuthGuard>
