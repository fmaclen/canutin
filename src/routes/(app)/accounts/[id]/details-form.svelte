<script lang="ts">
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';

	interface Props {
		formData: {
			name: string;
			institution: string;
			balanceGroup: string;
			accountTypeName: string;
			excluded: boolean;
			closed: boolean;
		};
		onSubmit: () => void;
	}

	let { formData, onSubmit }: Props = $props();
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
				<Label for="name" class="justify-start pr-0 md:justify-end">{m.accounts_label_name()}</Label
				>
				<Input id="name" bind:value={formData.name} required />
			</FormFieldRow>

			<FormFieldRow>
				<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
					<Label for="institution" class="justify-start pr-0 md:justify-end"
						>{m.accounts_label_institution()}</Label
					>
					<span class="text-muted-foreground text-sm">{m.accounts_text_optional()}</span>
				</div>
				<Input id="institution" bind:value={formData.institution} />
			</FormFieldRow>

			<FormFieldRow>
				<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
					>{m.accounts_label_category()}</Label
				>
				<Input
					id="category"
					name="category"
					bind:value={formData.accountTypeName}
					placeholder={m.accounts_category_placeholder()}
					required
				/>
			</FormFieldRow>

			<FormFieldRow>
				<Label for="balance-group" class="justify-start pr-0 md:justify-end"
					>{m.accounts_label_balance_group()}</Label
				>
				<Select.Root type="single" bind:value={formData.balanceGroup}>
					<Select.Trigger id="balance-group" class="bg-background w-full">
						{#if formData.balanceGroup}
							<div class="flex items-center gap-2">
								<div
									class="size-2 rounded-full {formData.balanceGroup ===
									AccountsBalanceGroupOptions.CASH
										? 'bg-cash'
										: formData.balanceGroup === AccountsBalanceGroupOptions.DEBT
											? 'bg-debt'
											: formData.balanceGroup === AccountsBalanceGroupOptions.INVESTMENT
												? 'bg-investment'
												: 'bg-other'}"
								></div>
								{#if formData.balanceGroup === AccountsBalanceGroupOptions.CASH}
									{m.accounts_group_cash_label()}
								{:else if formData.balanceGroup === AccountsBalanceGroupOptions.DEBT}
									{m.accounts_group_debt_label()}
								{:else if formData.balanceGroup === AccountsBalanceGroupOptions.INVESTMENT}
									{m.accounts_group_investment_label()}
								{:else if formData.balanceGroup === AccountsBalanceGroupOptions.OTHER}
									{m.accounts_group_other_label()}
								{/if}
							</div>
						{:else}
							<span class="text-muted-foreground"
								>{m.accounts_balance_group_select_placeholder()}</span
							>
						{/if}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={AccountsBalanceGroupOptions.CASH}>
							<div class="flex items-center gap-2">
								<div class="bg-cash size-2 rounded-full"></div>
								{m.accounts_group_cash_label()}
							</div>
						</Select.Item>
						<Select.Item value={AccountsBalanceGroupOptions.DEBT}>
							<div class="flex items-center gap-2">
								<div class="bg-debt size-2 rounded-full"></div>
								{m.accounts_group_debt_label()}
							</div>
						</Select.Item>
						<Select.Item value={AccountsBalanceGroupOptions.INVESTMENT}>
							<div class="flex items-center gap-2">
								<div class="bg-investment size-2 rounded-full"></div>
								{m.accounts_group_investment_label()}
							</div>
						</Select.Item>
						<Select.Item value={AccountsBalanceGroupOptions.OTHER}>
							<div class="flex items-center gap-2">
								<div class="bg-other size-2 rounded-full"></div>
								{m.accounts_group_other_label()}
							</div>
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</FormFieldRow>
		</Fieldset>

		<Fieldset>
			<FormFieldRow itemsAlignment="items-start">
				<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
					>{m.accounts_label_marked_as()}</Label
				>
				<div class="space-y-2">
					<Label
						for="excluded"
						class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
					>
						<Checkbox id="excluded" bind:checked={formData.excluded} class="bg-background" />
						<span>{m.accounts_label_exclude_from_net_worth()}</span>
					</Label>
					<Label
						for="closed"
						class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
					>
						<Checkbox id="closed" bind:checked={formData.closed} class="bg-background" />
						<span>{m.accounts_label_closed()}</span>
					</Label>
				</div>
			</FormFieldRow>
		</Fieldset>

		<footer class="border-border bg-border border-t p-2">
			<div class="flex justify-end">
				<Button type="submit">{m.accounts_button_save()}</Button>
			</div>
		</footer>
	</form>
</div>
