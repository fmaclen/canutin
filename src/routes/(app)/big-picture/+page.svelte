<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { m } from '$lib/paraglide/messages';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	type Groups = { CASH: number; DEBT: number; INVESTMENT: number; OTHER: number };
	const totals = $derived.by(() => {
		const g: Groups = { CASH: 0, DEBT: 0, INVESTMENT: 0, OTHER: 0 };
		for (const a of accountsContext.accounts) g[a.balanceGroup] += a.balance ?? 0;
		for (const a of assetsContext.assets) g[a.balanceGroup] += a.balance ?? 0;
		const netWorth = g.CASH + g.INVESTMENT + g.OTHER - g.DEBT;
		return { totalsByGroup: g, netWorth } as const;
	});
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item class="hidden md:block">
					<Breadcrumb.Page>{m.sidebar_big_picture()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

{#snippet sectionTitle(title: string)}
	<div class="h-8px-2 text-muted-foreground flex text-xs font-medium bg-muted rounded px-2 py-1 w-full h-9 items-center">
		{title}
	</div>
{/snippet}

{#snippet card(title: string, value: number | null, className?: string)}
	<div
		class="flex items-center justify-between rounded-sm p-4 shadow-md {className ??
			'bg-background'}"
	>
		<div class="text-sm font-semibold tracking-tight">{title}</div>
		<div class="font-mono text-sm tabular-nums">
			<Currency {value} />
		</div>
	</div>
{/snippet}

<div class="flex flex-col space-y-10 px-6 py-8">
	<section class="mx-auto flex w-full flex-col space-y-2">
		{@render sectionTitle('Summary')}
		<div class="text-background grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<div class="flex flex-col justify-between rounded-sm bg-black p-5 shadow-md md:row-span-2">
				<div class="text-base font-semibold tracking-tight">Net worth</div>
				<div class="font-mono text-xl">
					<Currency value={totals.netWorth} />
				</div>
			</div>
			{@render card('Cash', totals.totalsByGroup.CASH, 'bg-cash')}
			{@render card('Investments', totals.totalsByGroup.INVESTMENT, 'bg-investment')}
			{@render card('Debt', totals.totalsByGroup.DEBT, 'bg-debt')}
			{@render card('Other assets', totals.totalsByGroup.OTHER, 'bg-other')}
		</div>
	</section>

	<section class="mx-auto flex w-full flex-col space-y-2">
		<Tabs.Root value="six-months">
			<nav class="flex items-center justify-between space-x-2">
				{@render sectionTitle('Trailing cashflow')}

				<Tabs.List>
					<Tabs.Trigger value="three-months">3M</Tabs.Trigger>
					<Tabs.Trigger value="six-months">6M</Tabs.Trigger>
					<Tabs.Trigger value="nine-months">YTD</Tabs.Trigger>
					<Tabs.Trigger value="one-year">1Y</Tabs.Trigger>
					<Tabs.Trigger value="two-years">2Y</Tabs.Trigger>
				</Tabs.List>
			</nav>
			<Tabs.Content value="three-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					{@render card('Income per month', 15000)}
					{@render card('Expenses per month', 10000)}
					{@render card('Surplus per month', 5000)}
				</div>
			</Tabs.Content>
			<Tabs.Content value="six-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					{@render card('Income per month', 15000)}
					{@render card('Expenses per month', 10000)}
					{@render card('Surplus per month', 5000)}
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</section>
</div>
