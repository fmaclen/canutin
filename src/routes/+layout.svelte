<script lang="ts">
	import '../app.css';

	import favicon from '$lib/assets/favicon.png';
	import { setAuthContext } from '$lib/auth.svelte';
	import Sonner from '$lib/components/ui/sonner/sonner.svelte';
	import { getPocketBaseContext, setPocketBaseContext } from '$lib/pocketbase.svelte';

	import AuthGuard from './auth-guard.svelte';

	let { children } = $props();

	setPocketBaseContext();

	const pb = getPocketBaseContext();
	setAuthContext(pb.authedClient);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Canutin</title>
</svelte:head>

<Sonner />

<div class="bg-muted">
	<AuthGuard>
		{@render children?.()}
	</AuthGuard>
</div>
