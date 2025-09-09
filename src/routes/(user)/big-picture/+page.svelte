<script lang="ts">
	import { onMount } from 'svelte';

	import { getAuthContext } from '$lib/auth.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { m } from '$lib/paraglide/messages';

	type TotalsResponse = {
		totalsByGroup: Record<'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER', number>;
		netWorth: number;
	};

	let totals: TotalsResponse = $state({
		totalsByGroup: { CASH: 0, DEBT: 0, INVESTMENT: 0, OTHER: 0 },
		netWorth: 0
	});

	function fmt(n: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(n ?? 0);
	}

	onMount(async () => {
		try {
			const auth = getAuthContext();
			if (!auth.currentUser?.isValid) return;
			// Explicitly attach Authorization header to be safe
			const token: string | undefined = auth.pb.authStore?.token;
			const res = (await auth.pb.send('/api/totals', {
				method: 'GET',
				headers: token ? { Authorization: `Bearer ${token}` } : undefined
			})) as TotalsResponse;
			totals = res;
		} catch (e) {
			// Silently keep zeros; optionally log in dev
			console.error('Failed to load totals', e);
		}
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
	<div
		class="text-muted-foreground flex h-8 items-center font-mono text-xs leading-none tracking-wider uppercase"
	>
		{title}
	</div>
{/snippet}

{#snippet card(title: string, value: string, className?: string)}
	<div
		class="flex items-center justify-between rounded-sm p-4 shadow-md {className ??
			'bg-background'}"
	>
		<div class="text-sm font-semibold tracking-tight">{title}</div>
		<div class="font-mono text-sm tabular-nums">{value}</div>
	</div>
{/snippet}

<div class="flex flex-col space-y-10 px-6 py-8">
	<section class="mx-auto flex w-full flex-col space-y-2">
		{@render sectionTitle('Summary')}
		<div class="text-background grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<div class="flex flex-col justify-between rounded-sm bg-black p-5 shadow-md md:row-span-2">
				<div class="text-base font-semibold tracking-tight">Net worth</div>
				<div class="font-mono text-xl">{fmt(totals.netWorth)}</div>
			</div>
			{@render card('Cash', fmt(totals.totalsByGroup.CASH), 'bg-cash')}
			{@render card('Investments', fmt(totals.totalsByGroup.INVESTMENT), 'bg-investment')}
			{@render card('Debt', fmt(totals.totalsByGroup.DEBT), 'bg-debt')}
			{@render card('Other assets', fmt(totals.totalsByGroup.OTHER), 'bg-other')}
		</div>
	</section>

	<section class="mx-auto flex w-full flex-col space-y-2">
		<Tabs.Root value="six-months">
			<nav class="flex items-center justify-between">
				{@render sectionTitle('Trailing cashflow')}

				<div class="flex items-center space-x-2">
					<div class="flex items-center space-x-2 rounded border p-2">
						<Checkbox id="terms" />
						<Label for="terms">Include current month</Label>
					</div>
					<Tabs.List>
						<Tabs.Trigger value="three-months">3M</Tabs.Trigger>
						<Tabs.Trigger value="six-months">6M</Tabs.Trigger>
						<Tabs.Trigger value="nine-months">YTD</Tabs.Trigger>
						<Tabs.Trigger value="one-year">1Y</Tabs.Trigger>
						<Tabs.Trigger value="two-years">2Y</Tabs.Trigger>
					</Tabs.List>
				</div>
			</nav>
			<Tabs.Content value="three-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					{@render card('Income per month', '$15,000')}
					{@render card('Expenses per month', '$10,000')}
					{@render card('Surplus per month', '$5,000')}
				</div>
			</Tabs.Content>
			<Tabs.Content value="six-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					{@render card('Income per month', '$15,000')}
					{@render card('Expenses per month', '$10,000')}
					{@render card('Surplus per month', '$5,000')}
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</section>
</div>
