<script lang="ts">
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions } from '$lib/pocketbase.schema';

	interface Props {
		formData: {
			name: string;
			balanceGroup: string;
			balanceTypeName: string;
			notes: string;
			excluded: boolean;
			sold: boolean;
		};
		currency: string;
		onSubmit: () => void;
		disabled?: boolean;
	}

	let { formData, currency, onSubmit, disabled = false }: Props = $props();
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
				<Label for="name" class="justify-start pr-0 md:justify-end">{m.assets_label_name()}</Label>
				<Input id="name" bind:value={formData.name} required {disabled} />
			</FormFieldRow>

			<FormFieldRow>
				<Label for="currency" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_currency()}</Label
				>
				<Input id="currency" value={currency} disabled />
			</FormFieldRow>

			<FormFieldRow>
				<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_category()}</Label
				>
				<Input
					id="category"
					name="category"
					bind:value={formData.balanceTypeName}
					placeholder={m.assets_category_placeholder()}
					required
					{disabled}
				/>
			</FormFieldRow>

			<FormFieldRow>
				<Label for="balance-group" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_balance_group()}</Label
				>
				<Select.Root type="single" bind:value={formData.balanceGroup} {disabled}>
					<Select.Trigger id="balance-group" class="bg-background w-full">
						{#if formData.balanceGroup}
							<div class="flex items-center gap-2">
								<div
									class="size-2 rounded-full {formData.balanceGroup ===
									AssetsBalanceGroupOptions.CASH
										? 'bg-cash'
										: formData.balanceGroup === AssetsBalanceGroupOptions.DEBT
											? 'bg-debt'
											: formData.balanceGroup === AssetsBalanceGroupOptions.INVESTMENT
												? 'bg-investment'
												: 'bg-other-assets'}"
								></div>
								{#if formData.balanceGroup === AssetsBalanceGroupOptions.CASH}
									{m.assets_group_cash_label()}
								{:else if formData.balanceGroup === AssetsBalanceGroupOptions.DEBT}
									{m.assets_group_debt_label()}
								{:else if formData.balanceGroup === AssetsBalanceGroupOptions.INVESTMENT}
									{m.assets_group_investment_label()}
								{:else if formData.balanceGroup === AssetsBalanceGroupOptions.OTHER}
									{m.assets_group_other_label()}
								{/if}
							</div>
						{:else}
							<span class="text-muted-foreground"
								>{m.assets_balance_group_select_placeholder()}</span
							>
						{/if}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={AssetsBalanceGroupOptions.CASH}>
							<div class="flex items-center gap-2">
								<div class="bg-cash size-2 rounded-full"></div>
								{m.assets_group_cash_label()}
							</div>
						</Select.Item>
						<Select.Item value={AssetsBalanceGroupOptions.DEBT}>
							<div class="flex items-center gap-2">
								<div class="bg-debt size-2 rounded-full"></div>
								{m.assets_group_debt_label()}
							</div>
						</Select.Item>
						<Select.Item value={AssetsBalanceGroupOptions.INVESTMENT}>
							<div class="flex items-center gap-2">
								<div class="bg-investment size-2 rounded-full"></div>
								{m.assets_group_investment_label()}
							</div>
						</Select.Item>
						<Select.Item value={AssetsBalanceGroupOptions.OTHER}>
							<div class="flex items-center gap-2">
								<div class="bg-other-assets size-2 rounded-full"></div>
								{m.assets_group_other_label()}
							</div>
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</FormFieldRow>

			<FormFieldRow itemsAlignment="items-start">
				<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
					<Label for="notes" class="justify-start pr-0 md:justify-end"
						>{m.assets_label_notes()}</Label
					>
					<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
				</div>
				<Textarea id="notes" bind:value={formData.notes} class="bg-background" {disabled} />
			</FormFieldRow>
		</Fieldset>

		<Fieldset>
			<FormFieldRow itemsAlignment="items-start">
				<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
					>{m.assets_label_marked_as()}</Label
				>
				<div class="space-y-2">
					<Label
						for="excluded"
						class="flex h-9 items-center gap-2 rounded border px-3 py-1 font-normal"
					>
						<Checkbox
							id="excluded"
							bind:checked={formData.excluded}
							class="bg-background"
							{disabled}
						/>
						<span>{m.assets_label_exclude_from_net_worth()}</span>
					</Label>
					<Label
						for="sold"
						class="flex h-9 items-center gap-2 rounded border px-3 py-1 font-normal"
					>
						<Checkbox id="sold" bind:checked={formData.sold} class="bg-background" {disabled} />
						<span>{m.assets_label_sold()}</span>
					</Label>
				</div>
			</FormFieldRow>
		</Fieldset>

		{#if !disabled}
			<footer class="border-border bg-border border-t p-2">
				<div class="flex justify-end">
					<Button type="submit">{m.assets_button_save()}</Button>
				</div>
			</footer>
		{/if}
	</form>
</div>
