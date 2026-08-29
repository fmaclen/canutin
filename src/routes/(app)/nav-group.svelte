<script lang="ts">
	import type { Component } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	type NavGroupRoute = '/big-picture' | '/balance-sheet' | '/portfolio' | '/trends';

	let {
		links
	}: {
		links: readonly {
			name: string;
			url: NavGroupRoute;
			icon: Component;
		}[];
	} = $props();

	function isActive(url: NavGroupRoute) {
		return page.url.pathname === resolve(url);
	}
</script>

<Sidebar.Group
	class="border-t pt-6 pb-0 group-data-[collapsible=icon]:hidden first:border-t-0 first:pt-4"
>
	<Sidebar.Menu>
		{#each links as item (item.name)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton isActive={isActive(item.url)}>
					{#snippet child({ props })}
						<a href={resolve(item.url)} {...props}>
							<item.icon />
							<span>{item.name}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
