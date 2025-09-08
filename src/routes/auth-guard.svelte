<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import { page } from '$app/state';

	let { children } = $props();

	const auth = getAuthContext();

	$effect(() => {
		// Skip auth guard for /demo/paraglide
		// FIXME: remove after removing smoke test
		if (page.url.pathname.startsWith('/demo/paraglide')) return;

		if (auth.isLoading) return;
		if (auth.currentUser?.isValid) goto(resolve('/big-picture'));
		else goto(resolve('/auth'));
	});
</script>

{@render children?.()}
