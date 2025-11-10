<script lang="ts">
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
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
	}

	let { formData, isWhole, isShares, onSubmit }: Props = $props();
</script>

<div class="bg-muted border-border overflow-hidden rounded-md border">
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
					<Input id="market-value" type="number" step="0.01" bind:value={formData.marketValue} />
				</FormFieldRow>

				<FormFieldRow>
					<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
						<Label for="book-value" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_book_value()}</Label
						>
						<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
					</div>
					<Input id="book-value" type="number" step="0.01" bind:value={formData.bookValue} />
				</FormFieldRow>
			{:else if isShares}
				<FormFieldRow>
					<Label for="quantity" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_quantity()}</Label
					>
					<Input id="quantity" type="number" step="0.01" bind:value={formData.quantity} />
				</FormFieldRow>

				<FormFieldRow>
					<Label for="market-price" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_market_price()}</Label
					>
					<Input id="market-price" type="number" step="0.01" bind:value={formData.marketPrice} />
				</FormFieldRow>

				<FormFieldRow>
					<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
						<Label for="book-price" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_book_price()}</Label
						>
						<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
					</div>
					<Input id="book-price" type="number" step="0.01" bind:value={formData.bookPrice} />
				</FormFieldRow>
			{/if}
		</Fieldset>

		<footer class="border-border bg-border border-t p-2">
			<div class="flex justify-end">
				<Button type="submit">{m.assets_button_update()}</Button>
			</div>
		</footer>
	</form>
</div>
