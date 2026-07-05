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
			marketValue: string;
			bookValue: string;
		};
		currency: string;
		balanceAsOf?: string;
		onSubmit: () => void;
		disabled?: boolean;
	}

	let { formData, currency, balanceAsOf = '', onSubmit, disabled = false }: Props = $props();

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

<div class="bg-muted border-border overflow-hidden rounded border">
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
					<Label for="market-value" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_market_value()}</Label
					>
					{#if formattedAsOf}
						{@const asOfParts = m.assets_text_balance_as_of({ date: '\u0000' }).split('\u0000')}
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
				<CurrencyField
					id="market-value"
					name="market-value"
					bind:value={formData.marketValue}
					{currency}
					{disabled}
				/>
			</FormFieldRow>

			<FormFieldRow>
				<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
					<Label for="book-value" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_book_value()}</Label
					>
					<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
				</div>
				<CurrencyField
					id="book-value"
					name="book-value"
					bind:value={formData.bookValue}
					{currency}
					{disabled}
				/>
			</FormFieldRow>
		</Fieldset>

		{#if !disabled}
			<footer class="border-border bg-border border-t p-2">
				<div class="flex justify-end">
					<Button type="submit">{m.assets_button_update()}</Button>
				</div>
			</footer>
		{/if}
	</form>
</div>
