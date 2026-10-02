<script lang="ts">
	import '../app.css';

	import { ModeWatcher } from 'mode-watcher';
	import { untrack } from 'svelte';

	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.png';
	import { setAuthContext } from '$lib/auth.svelte';
	import Sonner from '$lib/components/ui/sonner/sonner.svelte';
	import { setDemoContext } from '$lib/demo/demo.svelte';
	import {
		initializeDisplayCurrency,
		initializeLocale,
		interfacePreferences
	} from '$lib/interface-preferences.svelte';
	import { setPocketBaseContext } from '$lib/pocketbase.svelte';

	import type { LayoutProps } from './$types';
	import AuthGuard from './auth-guard.svelte';
	import SetupSplash from './setup-splash.svelte';

	let { children, data }: LayoutProps = $props();

	const pb = setPocketBaseContext();
	const auth = setAuthContext(pb.authedClient);
	setDemoContext(
		auth,
		untrack(() => data.config.demoEnabled)
	);

	pb.onAuthInvalidated = () => auth.invalidateSession();
	pb.onSessionResume = () => auth.validateSession();

	if (browser) {
		initializeDisplayCurrency();
		void initializeLocale();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Canutin</title>
	{#if data.config.plausibleDomain && data.config.plausibleScriptUrl}
		<script
			async
			data-domain={data.config.plausibleDomain}
			src={data.config.plausibleScriptUrl}
		></script>
	{/if}
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<Sonner />

{#if data.config.setupReady}
	<div class="bg-muted">
		{#key interfacePreferences.locale}
			<AuthGuard>
				{@render children?.()}
			</AuthGuard>
		{/key}
	</div>
{:else}
	<SetupSplash />
{/if}
