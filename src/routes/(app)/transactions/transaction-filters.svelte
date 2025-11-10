<script lang="ts">
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';
	import {
		getTransactionsContext,
		type KindFilter,
		type PeriodOption
	} from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

	function periodLabel(option: PeriodOption) {
		switch (option) {
			case 'mtd':
				return m.period_mtd_label();
			case '1m':
				return m.period_1m_label();
			case '3m':
				return m.period_3m_label();
			case '6m':
				return m.period_6m_label();
			case '12m':
				return m.period_12m_label();
			case 'ytd':
				return m.period_ytd_label();
			case 'all':
			default:
				return m.period_all_label();
		}
	}

	function kindLabel(option: KindFilter) {
		switch (option) {
			case 'credits':
				return m.transactions_kind_credits_label();
			case 'debits':
				return m.transactions_kind_debits_label();
			case 'all':
			default:
				return m.transactions_kind_all_label();
		}
	}
</script>

<nav class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	<SectionTitle title={m.transactions_section_title()} />
	<div class="flex items-center gap-3">
		<Tabs.Root bind:value={txContext.period}>
			<Tabs.List class="flex items-center gap-1">
				{#each txContext.periodOptions as option (option)}
					<Tabs.Trigger value={option}>{periodLabel(option)}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>
		<Tabs.Root bind:value={txContext.kind}>
			<Tabs.List class="flex items-center gap-1">
				{#each txContext.kindOptions as option (option)}
					<Tabs.Trigger value={option}>{kindLabel(option)}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>
	</div>
</nav>
