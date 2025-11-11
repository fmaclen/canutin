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
				return 'This month';
			case 'last-month':
				return 'Last month';
			case 'last-3-months':
				return 'Last 3 months';
			case 'last-6-months':
				return 'Last 6 months';
			case 'last-12-months':
				return 'Last 12 months';
			case 'year-to-date':
				return 'Year to date';
			case 'last-year':
				return 'Last year';
			case 'lifetime':
			default:
				return 'Lifetime';
		}
	}

	function kindLabel(option: KindFilter) {
		switch (option) {
			case 'credits':
				return 'Credits only';
			case 'debits':
				return 'Debits only';
			case 'all':
			default:
				return 'Any amounts';
		}
	}
</script>

<div class="flex flex-col gap-4">
	<SectionTitle title={m.transactions_section_title()} />
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<Select.Root type="single" bind:value={txContext.period}>
			<Select.Trigger aria-label="Period" class="bg-background sm:w-48">
				{periodLabel(txContext.period)}
			</Select.Trigger>
			<Select.Content>
				{#each txContext.periodOptions as option (option)}
					<Select.Item value={option}>{periodLabel(option)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root type="single" bind:value={txContext.kind}>
			<Select.Trigger aria-label="Type" class="bg-background sm:w-48">
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
