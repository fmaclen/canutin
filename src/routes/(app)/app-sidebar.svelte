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

	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages.js';

	import NavGroup from './nav-group.svelte';
	import NavUser from './nav-user.svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const sidebar = Sidebar.useSidebar();

	// The mobile sidebar is a Sheet that only closes explicitly - navigating to a
	// new route doesn't close it on its own. Close it after every navigation so
	// tapping a link on mobile both navigates and dismisses the drawer.
	afterNavigate(() => {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	});

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
	<Sidebar.Header class="h-12 border-b px-2 pt-1 pb-0">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<a href={resolve('/')} aria-label={m.app_name()} {...props}>
							<CanutinIcon class="size-4" fill="brand" />
							<span class="flex">
								<CanutinWordmark class="dark:text-foreground h-2.75 w-auto text-stone-700" />
							</span>
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
					<Sidebar.MenuButton isActive={isPrefixActive('/assets')}>
						{#snippet child({ props })}
							<a href={resolve('/assets')} {...props}>
								<LandmarkIcon />
								<span>{m.sidebar_assets()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group
			class="border-t pt-6 pb-0 group-data-[collapsible=icon]:hidden first:border-t-0 first:pt-4"
		>
			<Sidebar.Menu>
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
