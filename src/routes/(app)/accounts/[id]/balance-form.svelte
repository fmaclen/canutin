<script lang="ts">
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		formData: {
			value: string;
		};
		balanceAsOf?: string;
		onSubmit: () => void;
		disabled?: boolean;
	}

	let { formData, balanceAsOf = '', onSubmit, disabled = false }: Props = $props();

	const formattedAsOf = $derived.by(() => {
		if (!balanceAsOf) return '';
		const parsed = new Date(balanceAsOf);
		if (Number.isNaN(parsed.getTime())) return '';
		return parsed.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	});
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
					<Label for="value" class="justify-start pr-0 md:justify-end"
						>{m.accounts_label_balance()}</Label
					>
					{#if formattedAsOf}
						<span class="text-muted-foreground text-sm" data-testid="balance-as-of"
							>{m.accounts_text_balance_as_of({ date: formattedAsOf })}</span
						>
					{/if}
				</div>
				<CurrencyField id="value" name="value" bind:value={formData.value} {disabled} />
			</FormFieldRow>
		</Fieldset>

		{#if !disabled}
			<footer class="border-border bg-border border-t p-2">
				<div class="flex justify-end">
					<Button type="submit">{m.accounts_button_update()}</Button>
				</div>
			</footer>
		{/if}
	</form>
</div>
