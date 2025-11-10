<script lang="ts">
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions, AssetsTypeOptions } from '$lib/pocketbase.schema';

	interface Props {
		formData: {
			name: string;
			balanceGroup: string;
			assetTypeName: string;
			symbol: string;
			excluded: boolean;
			sold: boolean;
			type: string;
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
			<FormFieldRow>
				<Label for="name" class="justify-start pr-0 md:justify-end">{m.assets_label_name()}</Label>
				<Input id="name" bind:value={formData.name} required />
			</FormFieldRow>

			<FormFieldRow>
				<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_category()}</Label
				>
				<Input
					id="category"
					name="category"
					bind:value={formData.assetTypeName}
					placeholder={m.assets_category_placeholder()}
					required
				/>
			</FormFieldRow>

			<FormFieldRow>
				<Label for="balance-group" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_balance_group()}</Label
				>
				<Select.Root type="single" bind:value={formData.balanceGroup}>
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
												: 'bg-other'}"
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
								<div class="bg-other size-2 rounded-full"></div>
								{m.assets_group_other_label()}
							</div>
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</FormFieldRow>
		</Fieldset>

		<Fieldset>
			<FormFieldRow>
				<Label id="type-label" for="type" class="justify-start pr-0 md:justify-end"
					>{m.assets_label_type()}</Label
				>
				<Select.Root type="single" bind:value={formData.type}>
					<Select.Trigger
						id="type"
						name="type"
						aria-labelledby="type-label"
						class="bg-background w-full"
						disabled={true}
					>
						{#if isWhole}
							{m.assets_type_whole_label()}
						{:else if isShares}
							{m.assets_type_shares_label()}
						{/if}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={AssetsTypeOptions.WHOLE}>
							{m.assets_type_whole_label()}
						</Select.Item>
						<Select.Item value={AssetsTypeOptions.SHARES}>
							{m.assets_type_shares_label()}
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</FormFieldRow>

			{#if isShares}
				<FormFieldRow>
					<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
						<Label for="symbol" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_symbol()}</Label
						>
						<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
					</div>
					<Input id="symbol" bind:value={formData.symbol} />
				</FormFieldRow>
			{/if}
		</Fieldset>

		<Fieldset>
			<FormFieldRow itemsAlignment="items-start">
				<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
					>{m.assets_label_marked_as()}</Label
				>
				<div class="space-y-2">
					<Label
						for="excluded"
						class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
					>
						<Checkbox id="excluded" bind:checked={formData.excluded} class="bg-background" />
						<span>{m.assets_label_exclude_from_net_worth()}</span>
					</Label>
					<Label
						for="sold"
						class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
					>
						<Checkbox id="sold" bind:checked={formData.sold} class="bg-background" />
						<span>{m.assets_label_sold()}</span>
					</Label>
				</div>
			</FormFieldRow>
		</Fieldset>

		<footer class="border-border bg-border border-t p-2">
			<div class="flex justify-end">
				<Button type="submit">{m.assets_button_save()}</Button>
			</div>
		</footer>
	</form>
</div>
