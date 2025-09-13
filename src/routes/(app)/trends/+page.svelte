<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
	import { subYears, subMonths } from 'date-fns';

	let period: '3m' | '6m' | '1y' | 'ytd' | '5y' | 'all' = $state('3m');

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	const accountsByBalanceGroup = $derived.by(()=>{
		// return accountsContext.accounts.reduce(...);
	});

	const assetsByBalanceGroup = $derived.by(()=>{
		// return assetsContext.assets.reduce(...);
	});

	function getDateRange() {
		switch(period) {
			case '3m':
				return { startDate: subMonths(new Date(), 3), endDate: new Date() };
			case '6m':
				return { startDate: subMonths(new Date(), 6), endDate: new Date() };
			case '1y':
				return { startDate: subYears(new Date(), 1), endDate: new Date() };
			case 'ytd':
				return { startDate: new Date(new Date().getFullYear(), 0, 1), endDate: new Date() };
			case '5y':
				return { startDate: subYears(new Date(), 5), endDate: new Date() };
			case 'all':
				return { startDate: new Date(0), endDate: new Date() };
		}
	}

	async function getAccountBalances(accountId: string, startDate: Date, endDate: Date) {
		// query the db for account balances in the period
		return [];
	}

	async function getAssetBalances(assetId: string, startDate: Date, endDate: Date) {
		// query the db for asset balances in the period
		return [];
	}

	const data = $derived.by(async()=>{
		const balancesInPeriod = []
		const { startDate, endDate } = getDateRange();
		for (const account of accountsByBalanceGroup) {
			const accountBalancesInPeriod = await getAccountBalances(account.id, startDate, endDate)
			balancesInPeriod.push(...accountBalancesInPeriod)
		}
		for (const asset of assetsByBalanceGroup) {
			const assetBalancesInPeriod = await getAssetBalances(asset.id, startDate, endDate)
			balancesInPeriod.push(...assetBalancesInPeriod)
		}
		// somewhere here we need to normalize the balances so we only display one per week
		// then we return the shape our chart component expects
	})

	$inspect(data)
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_trends()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>
