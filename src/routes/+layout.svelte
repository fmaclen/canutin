<script lang="ts">
	import '../app.css';

	import favicon from '$lib/assets/favicon.png';
	import { setAuthContext } from '$lib/auth.svelte';
	import Sonner from '$lib/components/ui/sonner/sonner.svelte';

	import AuthGuard from './auth-guard.svelte';
	import { getPocketBaseClientContext, setPocketBaseClientContext } from '$lib/pocketbase.svelte';

	let { children } = $props();

	setPocketBaseClientContext();
	const pocketBaseClient = getPocketBaseClientContext();

	setAuthContext(pocketBaseClient.client);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Canutin</title>
</svelte:head>

<Sonner />

<AuthGuard>
	{@render children?.()}
</AuthGuard>
