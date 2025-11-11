<script lang="ts">
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		getTransactionsContext,
		type KindFilter,
		type PeriodOption
	} from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

	function periodLabel(option: PeriodOption) {
		switch (option) {
			case 'this-month':
				return m.transactions_filter_period_this_month();
			case 'last-month':
				return m.transactions_filter_period_last_month();
			case 'last-3-months':
				return m.transactions_filter_period_last_3_months();
			case 'last-6-months':
				return m.transactions_filter_period_last_6_months();
			case 'last-12-months':
				return m.transactions_filter_period_last_12_months();
			case 'year-to-date':
				return m.transactions_filter_period_year_to_date();
			case 'last-year':
				return m.transactions_filter_period_last_year();
			case 'lifetime':
			default:
				return m.transactions_filter_period_lifetime();
		}
	}

	function kindLabel(option: KindFilter) {
		switch (option) {
			case 'credits':
				return m.transactions_filter_kind_credits_only();
			case 'debits':
				return m.transactions_filter_kind_debits_only();
			case 'all':
			default:
				return m.transactions_filter_kind_any_amounts();
		}
	}
</script>

<div class="flex flex-col gap-4">
	<SectionTitle title={m.transactions_section_title()} />
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<Select.Root type="single" bind:value={txContext.period}>
			<Select.Trigger
				aria-label={m.transactions_filter_period_label()}
				class="bg-background sm:w-48"
			>
				{periodLabel(txContext.period)}
			</Select.Trigger>
			<Select.Content>
				{#each txContext.periodOptions as option (option)}
					<Select.Item value={option}>{periodLabel(option)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root type="single" bind:value={txContext.kind}>
			<Select.Trigger aria-label={m.transactions_filter_kind_label()} class="bg-background sm:w-48">
				{kindLabel(txContext.kind)}
			</Select.Trigger>
			<Select.Content>
				{#each txContext.kindOptions as option (option)}
					<Select.Item value={option}>{kindLabel(option)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
</div>
