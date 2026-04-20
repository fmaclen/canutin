<script lang="ts">
	import '../app.css';

	import { ModeWatcher } from 'mode-watcher';

	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.png';
	import { setAuthContext } from '$lib/auth.svelte';
	import Sonner from '$lib/components/ui/sonner/sonner.svelte';
	import { setDemoContext } from '$lib/demo/demo.svelte';
	import { initializeLocale, interfacePreferences } from '$lib/interface-preferences.svelte';
	import { getPocketBaseContext, setPocketBaseContext } from '$lib/pocketbase.svelte';

	import AuthGuard from './auth-guard.svelte';
	import SetupSplash from './setup-splash.svelte';

	let { children } = $props();

	setPocketBaseContext();

	const pb = getPocketBaseContext();
	const auth = setAuthContext(pb.authedClient);
	setDemoContext(pb.authedClient, auth);

	if (browser) {
		void initializeLocale();
	}

	$effect(() => {
		pb.checkSetup();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Canutin</title>
</svelte:head>

<ModeWatcher />
<Sonner />

{#if pb.setupStatus === 'ready'}
	<div class="bg-muted">
		{#key interfacePreferences.locale}
			<AuthGuard>
				{@render children?.()}
			</AuthGuard>
		{/key}
	</div>
{:else}
	<SetupSplash status={pb.setupStatus} backendUrl={pb.backendUrl} />
{/if}
