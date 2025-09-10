<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	import AppSidebar from './app-sidebar.svelte';

	let { children } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
