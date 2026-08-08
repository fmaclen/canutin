<script lang="ts">
	import { onDestroy, untrack } from 'svelte';

	import { navigating } from '$app/state';
	import { setAccountsContext } from '$lib/accounts.svelte';
	import { setAssetsContext } from '$lib/assets.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { setBalanceTypesContext } from '$lib/balance-types.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { setCurrenciesContext } from '$lib/currencies.svelte';
	import { setExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { setImportSessionsContext } from '$lib/import-sessions.svelte';
	import { connectDisplayCurrencyRegistry } from '$lib/interface-preferences.svelte';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setSecuritiesContext } from '$lib/securities.svelte';

	import AppSidebar from './app-sidebar.svelte';

	let { children } = $props();
	let progressState = $state<'idle' | 'starting' | 'pending' | 'complete' | 'fading'>('idle');
	let wasNavigating = false;
	const isNavigating = $derived(Boolean(navigating.to));

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const balanceTypesContext = setBalanceTypesContext(pb);
	const currenciesContext = setCurrenciesContext(pb);
	connectDisplayCurrencyRegistry(currenciesContext);
	const exchangeRatesContext = setExchangeRatesContext(pb, currenciesContext);
	const accountsContext = setAccountsContext(pb, balanceTypesContext);
	const assetsContext = setAssetsContext(pb, balanceTypesContext);
	const securitiesContext = setSecuritiesContext(pb);
	accountsContext.connectPositions(securitiesContext);
	const importSessionsContext = setImportSessionsContext(pb);

	$effect(() => {
		const navigationPending = isNavigating;
		let revealTimer: ReturnType<typeof setTimeout> | undefined;
		let startFrame: number | undefined;
		let advanceFrame: number | undefined;
		let fadeTimer: ReturnType<typeof setTimeout> | undefined;
		let removeTimer: ReturnType<typeof setTimeout> | undefined;

		// Fast navigations stay invisible; once shown, the bar remains continuous across redirects.
		if (navigationPending) {
			const currentState = untrack(() => progressState);
			if (currentState === 'complete' || currentState === 'fading') {
				progressState = 'idle';
			}
			if (currentState === 'idle' || currentState === 'complete' || currentState === 'fading') {
				revealTimer = setTimeout(() => {
					progressState = 'starting';
					startFrame = requestAnimationFrame(() => {
						advanceFrame = requestAnimationFrame(() => {
							progressState = 'pending';
						});
					});
				}, 300);
			}
		} else if (wasNavigating) {
			const currentState = untrack(() => progressState);
			if (currentState !== 'idle') {
				progressState = 'complete';
				fadeTimer = setTimeout(() => (progressState = 'fading'), 240);
				removeTimer = setTimeout(() => (progressState = 'idle'), 390);
			}
		}
		wasNavigating = navigationPending;

		return () => {
			if (revealTimer !== undefined) clearTimeout(revealTimer);
			if (startFrame !== undefined) cancelAnimationFrame(startFrame);
			if (advanceFrame !== undefined) cancelAnimationFrame(advanceFrame);
			if (fadeTimer !== undefined) clearTimeout(fadeTimer);
			if (removeTimer !== undefined) clearTimeout(removeTimer);
		};
	});

	onDestroy(() => {
		balanceTypesContext.dispose();
		exchangeRatesContext.dispose();
		currenciesContext.dispose();
		accountsContext.dispose();
		assetsContext.dispose();
		securitiesContext.dispose();
		importSessionsContext.dispose();
	});
</script>

<Sidebar.Provider>
	<AppSidebar />
	{#if progressState !== 'idle'}
		<div
			class="navigation-progress bg-primary fixed inset-x-0 top-0 z-[60] h-[3px] origin-left"
			data-state={progressState}
			aria-hidden="true"
		></div>
	{/if}
	<Sidebar.Inset aria-busy={isNavigating}>
		{#if auth.currentUserId}
			{@render children?.()}
		{/if}
	</Sidebar.Inset>
</Sidebar.Provider>

<style>
	.navigation-progress {
		transition-property: transform, opacity;
		transition-timing-function: ease-out;
	}

	.navigation-progress[data-state='starting'] {
		transform: scaleX(0.1);
	}

	.navigation-progress[data-state='pending'] {
		transform: scaleX(0.88);
		transition-duration: 12s;
		transition-timing-function: cubic-bezier(0.1, 0.6, 0.2, 1);
	}

	.navigation-progress[data-state='complete'] {
		transform: scaleX(1);
		transition-duration: 140ms;
	}

	.navigation-progress[data-state='fading'] {
		transform: scaleX(1);
		opacity: 0;
		transition-duration: 150ms;
	}

	@media (prefers-reduced-motion: reduce) {
		.navigation-progress[data-state] {
			transition-duration: 0ms;
		}
	}
</style>
