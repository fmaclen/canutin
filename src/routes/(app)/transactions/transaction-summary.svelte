<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

	const showCredits = $derived(txContext.hasCredits && txContext.kind !== 'credits');
	const showDebits = $derived(txContext.hasDebits && txContext.kind !== 'debits');

	const cardCount = $derived(2 + (showCredits ? 1 : 0) + (showDebits ? 1 : 0));
	const columns = $derived(
		cardCount === 4
			? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
			: cardCount === 3
				? 'grid-cols-1 lg:grid-cols-3'
				: 'grid-cols-1 sm:grid-cols-2'
	);
</script>

<div role="region" aria-label={m.transactions_summary_aria_label()} class="grid gap-2 {columns}">
	<KeyValue
		title={m.transactions_summary_count_label()}
		value={txContext.totalItems}
		variant="outline"
		format="number"
	/>
	{#if showCredits}
		<KeyValue
			title={m.summary_net_credits()}
			value={txContext.creditsTotal.total}
			isPartial={txContext.creditsTotal.isPartial}
			variant="outline"
			decimalScale={2}
		/>
	{/if}
	{#if showDebits}
		<KeyValue
			title={m.summary_net_debits()}
			value={txContext.debitsTotal.total}
			isPartial={txContext.debitsTotal.isPartial}
			variant="outline"
			decimalScale={2}
		/>
	{/if}
	<KeyValue
		title={m.summary_net_amount()}
		value={txContext.netBalance.total}
		isPartial={txContext.netBalance.isPartial}
		variant="outline"
		decimalScale={2}
	/>
</div>
