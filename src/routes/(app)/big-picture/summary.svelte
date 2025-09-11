<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	type Groups = { CASH: number; DEBT: number; INVESTMENT: number; OTHER: number };
	const totals = $derived.by(() => {
		const g: Groups = { CASH: 0, DEBT: 0, INVESTMENT: 0, OTHER: 0 };
		for (const a of accountsContext.accounts)
			if (!a.excluded && !a.closed) g[a.balanceGroup] += a.balance ?? 0;
		for (const a of assetsContext.assets)
			if (!a.excluded && !a.sold) g[a.balanceGroup] += a.balance ?? 0;
		const netWorth = g.CASH + g.INVESTMENT + g.OTHER + g.DEBT;
		return { totalsByGroup: g, netWorth } as const;
	});
</script>

<div class="text-background grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
	<div class="flex flex-col justify-between rounded-sm bg-stone-700 p-5 shadow-md md:row-span-2" role="region" aria-label="Net worth">
		<div class="text-base font-semibold tracking-tight">Net worth</div>
		<div class="font-mono text-xl">
			<Currency value={totals.netWorth} />
		</div>
	</div>
	<KeyValue title="Cash" value={totals.totalsByGroup.CASH} className="bg-cash" />
	<KeyValue title="Investments" value={totals.totalsByGroup.INVESTMENT} className="bg-investment" />
	<KeyValue title="Debt" value={totals.totalsByGroup.DEBT} className="bg-debt" />
	<KeyValue title="Other assets" value={totals.totalsByGroup.OTHER} className="bg-other" />
</div>
