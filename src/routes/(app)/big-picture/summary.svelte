<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import { sumOrUnknown } from '$lib/security-balance-values';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
	const totals = $derived.by(() => {
		const valuesByGroup: Record<BalanceGroup, Array<number | null>> = {
			CASH: [],
			DEBT: [],
			INVESTMENT: [],
			OTHER: []
		};
		for (const a of accountsContext.accounts)
			if (!a.participantExcluded && !a.closed)
				valuesByGroup[a.balanceGroup as BalanceGroup].push(a.balance);
		for (const a of assetsContext.assets)
			if (!a.participantExcluded && !a.sold)
				valuesByGroup[a.balanceGroup as BalanceGroup].push(a.marketValue ?? 0);
		const totalsByGroup = {
			CASH: sumOrUnknown(valuesByGroup.CASH),
			DEBT: sumOrUnknown(valuesByGroup.DEBT),
			INVESTMENT: sumOrUnknown(valuesByGroup.INVESTMENT),
			OTHER: sumOrUnknown(valuesByGroup.OTHER)
		};
		const netWorth = sumOrUnknown([
			...valuesByGroup.CASH,
			...valuesByGroup.DEBT,
			...valuesByGroup.INVESTMENT,
			...valuesByGroup.OTHER
		]);
		return { totalsByGroup, netWorth } as const;
	});
</script>

<div class="grid gap-2 text-white lg:grid-cols-[1.3fr_1fr_1fr]">
	<div
		class="flex flex-col justify-between rounded-sm bg-stone-700 p-4 shadow-md md:row-span-2"
		role="region"
		aria-label="Net worth"
	>
		<div class="text-sm leading-none font-semibold tracking-tight">Net worth</div>
		<div class="translate-y-1.5 text-4xl">
			{#if totals.netWorth === null}
				<span class="text-white/70">~</span>
			{:else}
				<Currency value={totals.netWorth} />
			{/if}
		</div>
	</div>
	<KeyValue title="Cash" value={totals.totalsByGroup.CASH} variant="cash" />
	<KeyValue title="Investments" value={totals.totalsByGroup.INVESTMENT} variant="investment" />
	<KeyValue title="Debt" value={totals.totalsByGroup.DEBT} variant="debt" />
	<KeyValue title="Other assets" value={totals.totalsByGroup.OTHER} variant="other" />
</div>
