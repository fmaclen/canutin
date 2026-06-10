<script lang="ts">
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		formData: {
			name: string;
			symbol: string;
		};
		onSubmit: () => void;
	}

	let { formData, onSubmit }: Props = $props();
</script>

<div class="bg-muted border-border overflow-hidden rounded border">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			onSubmit();
		}}
		class="space-y-0"
	>
		<Fieldset isFirst={true}>
			<FormFieldRow>
				<Label for="security-name" class="justify-start pr-0 md:justify-end">
					{m.securities_label_name()}
				</Label>
				<Input id="security-name" bind:value={formData.name} required />
			</FormFieldRow>

			<FormFieldRow>
				<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
					<Label for="security-symbol" class="justify-start pr-0 md:justify-end">
						{m.securities_label_symbol()}
					</Label>
					<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
				</div>
				<Input id="security-symbol" bind:value={formData.symbol} />
			</FormFieldRow>
		</Fieldset>

		<footer class="border-border bg-border border-t p-2">
			<div class="flex justify-end">
				<Button type="submit">{m.securities_button_save()}</Button>
			</div>
		</footer>
	</form>
</div>
