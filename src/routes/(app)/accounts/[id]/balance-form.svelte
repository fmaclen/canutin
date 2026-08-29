<script lang="ts">
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		formData: {
			value: string;
		};
		currency: string;
		balanceAsOf?: string;
		onSubmit: () => void;
		disabled?: boolean;
		hasPositions?: boolean;
	}

	let {
		formData,
		currency,
		balanceAsOf = '',
		onSubmit,
		disabled = false,
		hasPositions = false
	}: Props = $props();

	const parsedAsOf = $derived.by(() => {
		if (!balanceAsOf) return null;
		const parsed = new Date(balanceAsOf);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed;
	});

	const formattedAsOf = $derived(
		parsedAsOf
			? parsedAsOf.toLocaleDateString(getFormattingLocale(), {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: ''
	);

	const fullAsOf = $derived(
		parsedAsOf
			? parsedAsOf.toLocaleString(getFormattingLocale(), {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					timeZoneName: 'short'
				})
			: ''
	);

	const isoAsOf = $derived(parsedAsOf ? parsedAsOf.toISOString() : '');
</script>

<div class="border-border overflow-hidden rounded border">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			onSubmit();
		}}
		class="space-y-0"
	>
		<Fieldset isFirst={true}>
			<FormFieldRow>
				<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
					<Label for="value" class="justify-start pr-0 md:justify-end"
						>{hasPositions ? m.accounts_label_cash() : m.accounts_label_balance()}</Label
					>
					{#if formattedAsOf}
						{@const asOfParts = m.accounts_text_balance_as_of({ date: '\u0000' }).split('\u0000')}
						<span class="text-muted-foreground text-sm" data-testid="balance-as-of">
							{asOfParts[0]}<time
								datetime={isoAsOf}
								title={fullAsOf}
								class="border-muted-foreground/60 cursor-help border-b border-dashed"
								>{formattedAsOf}</time
							>{asOfParts[1] ?? ''}
						</span>
					{/if}
				</div>
				<CurrencyField id="value" name="value" bind:value={formData.value} {currency} {disabled} />
			</FormFieldRow>
		</Fieldset>

		{#if !disabled}
			<footer class="border-border bg-border border-t p-2">
				<div class="flex justify-end">
					<Button type="submit">{m.accounts_button_add()}</Button>
				</div>
			</footer>
		{/if}
	</form>
</div>
