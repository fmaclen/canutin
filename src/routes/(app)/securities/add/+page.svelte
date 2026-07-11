<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { isDuplicateSecurityNameError } from '$lib/utils';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const currenciesContext = getCurrenciesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const currencyOptions = $derived(currenciesContext.currencyOptions);

	let name = $state('');
	let symbol = $state('');
	let currency = $state(interfacePreferences.displayCurrency);
	let currencyWasChanged = $state(false);

	const selectedCurrency = $derived(currenciesContext.getCurrency(currency));

	$effect(() => {
		if (!currencyWasChanged) {
			currency = interfacePreferences.displayCurrency;
		}
	});

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		if (!currenciesContext.hasCurrency(currency)) {
			toast.error(m.currency_required());
			return;
		}

		try {
			await pb.authedClient.collection('securities').create({
				name: name.trim(),
				symbol: symbol.trim() || undefined,
				owner: currentOwnerId,
				currency
			});
			toast.success(m.securities_add_success());
			await goto(resolve('/securities'));
		} catch (error) {
			if (isDuplicateSecurityNameError(error)) {
				toast.error(m.securities_name_duplicate());
				return;
			}
			logError('securitiesAdd', 'create', error);
			toast.error(m.securities_add_failed());
		}
	}
</script>

<Page
	pageTitle={m.securities_add_page_title()}
	crumbs={[
		{ label: m.securities_title(), href: resolve('/securities') },
		{ label: m.securities_add_page_title() }
	]}
>
	<Section>
		<SectionTitle title={m.securities_section_details()} />
		<div class="border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="security-name" class="justify-start pr-0 md:justify-end">
							{m.securities_label_name()}
						</Label>
						<Input id="security-name" bind:value={name} required />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="security-symbol" class="justify-start pr-0 md:justify-end">
								{m.securities_label_symbol()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
						</div>
						<Input id="security-symbol" bind:value={symbol} />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security-currency" class="justify-start pr-0 md:justify-end">
							{m.securities_label_currency()}
						</Label>
						<Select.Root
							type="single"
							value={currency}
							onValueChange={(value) => {
								currency = value;
								currencyWasChanged = true;
							}}
						>
							<Select.Trigger id="security-currency" class="bg-background w-full">
								{#if selectedCurrency}
									<div class="flex min-w-0 items-center gap-2">
										<span>{selectedCurrency.code}</span>
										{#if selectedCurrency.name}
											<span class="text-muted-foreground truncate">{selectedCurrency.name}</span>
										{/if}
									</div>
								{:else if currency}
									{currency}
								{:else}
									<span class="text-muted-foreground">{m.currencies_select_placeholder()}</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#if currencyOptions.length === 0}
									<Select.Item value="__no-currencies" disabled>
										{m.currencies_select_empty()}
									</Select.Item>
								{:else}
									{#each currencyOptions as option (option.value)}
										<Select.Item value={option.value}>
											<div class="flex min-w-0 items-center gap-2">
												<span>{option.code}</span>
												{#if option.name}
													<span class="text-muted-foreground truncate">{option.name}</span>
												{/if}
											</div>
										</Select.Item>
									{/each}
								{/if}
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.securities_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
