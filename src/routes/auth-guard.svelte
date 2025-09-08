<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';

	let { children } = $props();

	const auth = getAuthContext();

	$effect(() => {
		if (auth.isLoading) return;
		if (auth.currentUser?.isValid) goto(resolve('/big-picture'));
		else goto(resolve('/auth'));
	});
</script>

{@render children?.()}
