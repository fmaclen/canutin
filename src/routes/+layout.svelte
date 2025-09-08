<script lang="ts">
	import '../app.css';

	import favicon from '$lib/assets/favicon.svg';
	import { setAuthContext } from '$lib/auth.svelte';

	import AuthGuard from './auth-guard.svelte';

	let { children } = $props();

	setAuthContext();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<AuthGuard>
	{@render children?.()}
</AuthGuard>
