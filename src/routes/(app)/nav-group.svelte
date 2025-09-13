<script lang="ts">
	import type { Component } from 'svelte';

	import type { ResolvedPathname } from '$app/types';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let {
		// label,
		links
	}: {
		// label: string;
		links: {
			name: string;
			url: ResolvedPathname;
			icon: Component;
		}[];
	} = $props();
</script>

<Sidebar.Group
	class="border-t pt-6 pb-0 group-data-[collapsible=icon]:hidden first:border-t-0 first:pt-4"
>
	<!-- <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel> -->
	<Sidebar.Menu>
		{#each links as item (item.name)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a href={item.url} {...props}>
							<item.icon />
							<span>{item.name}</span>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
