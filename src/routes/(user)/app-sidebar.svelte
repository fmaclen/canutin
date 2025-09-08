<script lang="ts" module>
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import LandmarkIcon from '@lucide/svelte/icons/landmark';
	import LayoutListIcon from '@lucide/svelte/icons/layout-list';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PresentationIcon from '@lucide/svelte/icons/presentation';
	import WalletCardsIcon from '@lucide/svelte/icons/wallet-cards';

	import CanutinIcon from '$lib/components/canutin-icon.svelte';

	const insights = [
		{
			name: 'The big picture',
			url: '/big-picture',
			icon: PresentationIcon
		},
		{
			name: 'Balance sheet',
			url: '/balance-sheet',
			icon: LayoutListIcon
		},
		{
			name: 'Trends',
			url: '/trends',
			icon: ChartLineIcon
		}
	];

	const dataSources = [
		{
			name: 'Assets',
			url: '/assets',
			icon: LandmarkIcon
		},
		{
			name: 'Accounts',
			url: '/accounts',
			icon: WalletCardsIcon
		},
		{
			name: 'Transactions',
			url: '/transactions',
			icon: ArrowLeftRightIcon
		}
	];
</script>

<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	import NavGroup from './nav-group.svelte';
	import NavUser from './nav-user.svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="##" {...props}>
							<div
								class="bg-brand text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded"
							>
								<CanutinIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Canutin</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavGroup links={insights} label="Insights" />
		<NavGroup links={dataSources} label="Data sources" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
