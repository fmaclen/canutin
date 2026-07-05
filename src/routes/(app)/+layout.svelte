<script lang="ts">
	import { onDestroy } from 'svelte';

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
	<Sidebar.Inset>
		{#if auth.currentUserId}
			{@render children?.()}
		{/if}
	</Sidebar.Inset>
</Sidebar.Provider>
