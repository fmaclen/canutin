<script lang="ts">
	import AccountPicker, { type AccountPickerAccount } from '$lib/components/account-picker.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages';

	import type { SecurityBalanceFormData } from './balance-form';

	let {
		formData,
		accounts,
		currency,
		isFirst = false,
		disabled = false
	}: {
		formData: SecurityBalanceFormData;
		accounts: AccountPickerAccount[];
		currency?: string;
		isFirst?: boolean;
		disabled?: boolean;
	} = $props();
</script>

<Fieldset {isFirst}>
	<FormFieldRow>
		<Label for="security-balance-account" class="justify-start pr-0 md:justify-end">
			{m.securities_table_header_account()}
		</Label>
		<AccountPicker
			{accounts}
			bind:value={formData.accountId}
			id="security-balance-account"
			placeholder={m.securities_account_select_placeholder()}
			{disabled}
		/>
	</FormFieldRow>

	<FormFieldRow>
		<Label for="security-balance-as-of" class="justify-start pr-0 md:justify-end">
			{m.securities_table_header_as_of()}
		</Label>
		<Input id="security-balance-as-of" type="date" bind:value={formData.asOf} {disabled} required />
	</FormFieldRow>

	<FormFieldRow>
		<Label for="security-balance-quantity" class="justify-start pr-0 md:justify-end">
			{m.securities_table_header_quantity()}
		</Label>
		<CurrencyField
			id="security-balance-quantity"
			name="security-balance-quantity"
			bind:value={formData.quantity}
			{disabled}
			isCurrency={false}
			required
		/>
	</FormFieldRow>

	<FormFieldRow>
		<Label for="security-balance-price" class="justify-start pr-0 md:justify-end">
			{m.securities_table_header_price()}
		</Label>
		<CurrencyField
			id="security-balance-price"
			name="security-balance-price"
			bind:value={formData.price}
			{currency}
			{disabled}
			required
		/>
	</FormFieldRow>

	<FormFieldRow>
		<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
			<Label for="security-balance-value" class="justify-start pr-0 md:justify-end">
				{m.securities_table_header_value()}
			</Label>
			<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
		</div>
		<CurrencyField
			id="security-balance-value"
			name="security-balance-value"
			bind:value={formData.value}
			{currency}
			{disabled}
		/>
	</FormFieldRow>

	<FormFieldRow>
		<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
			<Label for="security-balance-cost-basis" class="justify-start pr-0 md:justify-end">
				{m.securities_table_header_cost_basis()}
			</Label>
			<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
		</div>
		<CurrencyField
			id="security-balance-cost-basis"
			name="security-balance-cost-basis"
			bind:value={formData.costBasis}
			{currency}
			{disabled}
		/>
	</FormFieldRow>
</Fieldset>
