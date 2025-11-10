<script lang="ts">
	import { setAccountsContext } from '$lib/accounts.svelte';
	import { setAssetsContext } from '$lib/assets.svelte';
	import { setBalanceTypesContext } from '$lib/balance-types.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import AppSidebar from './app-sidebar.svelte';

	let { children } = $props();

	const pb = getPocketBaseContext();
	const balanceTypesContext = setBalanceTypesContext(pb);
	setAccountsContext(pb, balanceTypesContext);
	setAssetsContext(pb, balanceTypesContext);
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
