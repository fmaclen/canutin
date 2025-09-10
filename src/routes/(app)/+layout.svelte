<script lang="ts">
	import { setAccountsContext } from '$lib/accounts.svelte';
	import { setAssetsContext } from '$lib/assets.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { getPocketBaseClientContext } from '$lib/pocketbase.svelte';

	import AppSidebar from './app-sidebar.svelte';

	let { children } = $props();

	const pocketBaseClient = getPocketBaseClientContext();
	setAccountsContext(pocketBaseClient.client);
	setAssetsContext(pocketBaseClient.client);
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
