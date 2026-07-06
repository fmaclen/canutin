<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import ChartCandlestickIcon from '@lucide/svelte/icons/chart-candlestick';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import CoinsIcon from '@lucide/svelte/icons/coins';
	import LandmarkIcon from '@lucide/svelte/icons/landmark';
	import LayoutListIcon from '@lucide/svelte/icons/layout-list';
	import PresentationIcon from '@lucide/svelte/icons/presentation';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import WalletCardsIcon from '@lucide/svelte/icons/wallet-cards';
	import type { ComponentProps } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages.js';

	import NavGroup from './nav-group.svelte';
	import NavUser from './nav-user.svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const insights = $derived([
		{
			name: m.sidebar_big_picture(),
			url: '/big-picture',
			icon: PresentationIcon
		},
		{
			name: m.sidebar_balance_sheet(),
			url: '/balance-sheet',
			icon: LayoutListIcon
		},
		{
			name: m.portfolio_page_title(),
			url: '/portfolio',
			icon: ChartCandlestickIcon
		},
		{
			name: m.sidebar_trends(),
			url: '/trends',
			icon: ChartLineIcon
		}
	] as const);

	function isPrefixActive(
		path: '/accounts' | '/transactions' | '/trades' | '/securities' | '/assets' | '/currencies'
	) {
		const resolvedPath = resolve(path);
		const currentPath = page.url.pathname;
		return currentPath === resolvedPath || currentPath.startsWith(`${resolvedPath}/`);
	}
</script>

<Sidebar.Root bind:ref variant="sidebar" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href={resolve('/')} {...props}>
							<div
								class="bg-brand text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center"
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
		<NavGroup links={insights} />
		<Sidebar.Group
			class="border-t pt-6 pb-0 group-data-[collapsible=icon]:hidden first:border-t-0 first:pt-4"
		>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/accounts')}>
						{#snippet child({ props })}
							<a href={resolve('/accounts')} {...props}>
								<WalletCardsIcon />
								<span>{m.sidebar_accounts()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/transactions')}>
						{#snippet child({ props })}
							<a href={resolve('/transactions')} {...props}>
								<ArrowLeftRightIcon />
								<span>{m.sidebar_transactions()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/trades')}>
						{#snippet child({ props })}
							<a href={resolve('/trades')} {...props}>
								<TrendingUpIcon />
								<span>{m.trades_title()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/securities')}>
						{#snippet child({ props })}
							<a href={resolve('/securities')} {...props}>
								<ScrollTextIcon />
								<span>{m.securities_title()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/assets')}>
						{#snippet child({ props })}
							<a href={resolve('/assets')} {...props}>
								<LandmarkIcon />
								<span>{m.sidebar_assets()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={isPrefixActive('/currencies')}>
						{#snippet child({ props })}
							<a href={resolve('/currencies')} {...props}>
								<CoinsIcon />
								<span>{m.sidebar_currencies()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
