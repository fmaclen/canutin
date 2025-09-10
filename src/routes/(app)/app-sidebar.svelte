<script lang="ts" module>
	// (module script intentionally left empty)
</script>

<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import LandmarkIcon from '@lucide/svelte/icons/landmark';
	import LayoutListIcon from '@lucide/svelte/icons/layout-list';
	import PresentationIcon from '@lucide/svelte/icons/presentation';
	import WalletCardsIcon from '@lucide/svelte/icons/wallet-cards';
	import type { ComponentProps } from 'svelte';

	import { resolve } from '$app/paths';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages.js';

	import NavGroup from './nav-group.svelte';
	import NavUser from './nav-user.svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const insights = $derived([
		{
			name: m.sidebar_big_picture(),
			url: resolve('/big-picture'),
			icon: PresentationIcon
		},
		{
			name: m.sidebar_balance_sheet(),
			url: resolve('/big-picture'),
			icon: LayoutListIcon
		},
		{
			name: m.sidebar_trends(),
			url: resolve('/big-picture'),
			icon: ChartLineIcon
		}
	]);

	const dataSources = $derived([
		{
			name: m.sidebar_assets(),
			url: resolve('/big-picture'),
			icon: LandmarkIcon
		},
		{
			name: m.sidebar_accounts(),
			url: resolve('/big-picture'),
			icon: WalletCardsIcon
		},
		{
			name: m.sidebar_transactions(),
			url: resolve('/big-picture'),
			icon: ArrowLeftRightIcon
		}
	]);
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href={resolve('/')} {...props}>
							<div
								class="bg-brand text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded"
							>
								<CanutinIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">{m.app_name()}</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavGroup links={insights} label={m.sidebar_insights()} />
		<NavGroup links={dataSources} label={m.sidebar_data_sources()} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
