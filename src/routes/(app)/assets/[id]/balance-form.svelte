<script lang="ts">
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		formData: {
			marketValue: string;
			bookValue: string;
			quantity: string;
			marketPrice: string;
			bookPrice: string;
		};
		isWhole: boolean;
		isShares: boolean;
		onSubmit: () => void;
		disabled?: boolean;
	}

	let { formData, isWhole, isShares, onSubmit, disabled = false }: Props = $props();
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
			{#if isWhole}
				<FormFieldRow>
					<Label for="market-value" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_market_value()}</Label
					>
					<CurrencyField
						id="market-value"
						name="market-value"
						bind:value={formData.marketValue}
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
						{disabled}
					/>
				</FormFieldRow>
			{:else if isShares}
				<FormFieldRow>
					<Label for="quantity" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_quantity()}</Label
					>
					<CurrencyField id="quantity" name="quantity" bind:value={formData.quantity} {disabled} />
				</FormFieldRow>

				<FormFieldRow>
					<Label for="market-price" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_market_price()}</Label
					>
					<CurrencyField
						id="market-price"
						name="market-price"
						bind:value={formData.marketPrice}
						{disabled}
					/>
				</FormFieldRow>

				<FormFieldRow>
					<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
						<Label for="book-price" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_book_price()}</Label
						>
						<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
					</div>
					<CurrencyField
						id="book-price"
						name="book-price"
						bind:value={formData.bookPrice}
						{disabled}
					/>
				</FormFieldRow>
			{/if}
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
