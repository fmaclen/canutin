<script lang="ts">
	import '../app.css';

	import PocketBase from 'pocketbase';

	import { env } from '$env/dynamic/public';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import { getAuthContext, setAuthContext } from '$lib/auth.svelte';

	let { children } = $props();

	const pb = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');

	setAuthContext(pb);
	const auth = getAuthContext();

	$effect(() => {
		if (auth.currentUser?.isValid) {
			goto(resolve('/big-picture'));
		} else {
			goto(resolve('/auth'));
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
