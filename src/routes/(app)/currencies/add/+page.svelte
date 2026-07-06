<script lang="ts">
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import { formatNativeCurrency, isIntlCurrency } from '$lib/components/currency';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const codePattern = /^[A-Z0-9]{2,10}$/;
	const codePatternAttribute = '[A-Z0-9]{2,10}';
	const previewAmount = '12345.67';

	let code = $state('');
	let name = $state('');
	let autoUpdate = $state(false);
	let rate = $state('');

	const currencyCode = $derived(code.trim().toUpperCase());
	const previewCode = $derived(currencyCode || 'USD');
	const isIntlPreviewCode = $derived(isIntlCurrency(previewCode));
	const previewValue = $derived(formatNativeCurrency(Number(previewAmount), 2, previewCode));
	const canSubmit = $derived(codePattern.test(currencyCode));

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	function responseFieldCode(error: ClientResponseError, field: string) {
		const data: unknown = error.response?.data;
		if (!isRecord(data)) return '';
		const fieldData = data[field];
		if (!isRecord(fieldData)) return '';
		const errorCode = fieldData.code;
		return typeof errorCode === 'string' ? errorCode : '';
	}

	function handleCodeInput(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) return;
		const nextCode = target.value.toUpperCase();
		target.value = nextCode;
		code = nextCode;
	}

	function todayUtcIso() {
		const now = new Date();
		return new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
		).toISOString();
	}

	function handleCurrencyCreateError(error: unknown) {
		if (!(error instanceof ClientResponseError) || error.status !== 400) return false;

		const autoUpdateCode = responseFieldCode(error, 'autoUpdate');
		if (autoUpdateCode === 'currency_auto_update_request_failed') {
			toast.error(m.currencies_auto_update_request_failed());
			return true;
		}
		if (autoUpdateCode === 'currency_auto_update_code_unavailable') {
			toast.error(m.currencies_auto_update_code_unavailable({ code: currencyCode }));
			return true;
		}

		toast.error(m.currencies_add_duplicate());
		return true;
	}

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !canSubmit) return;

		const trimmedRate = rate.trim();
		const hasRate = trimmedRate.length > 0;
		const rateValue = parseFloat(trimmedRate);
		if (hasRate && (!Number.isFinite(rateValue) || rateValue <= 0)) {
			toast.error(m.currencies_rate_invalid());
			return;
		}

		try {
			await pb.authedClient.collection('currencies').create({
				owner: currentOwnerId,
				code: currencyCode,
				name: name.trim() || undefined,
				autoUpdate
			});
		} catch (error) {
			if (handleCurrencyCreateError(error)) return;
			logError('addCurrency', 'create_currency', error);
			toast.error(m.currencies_add_failed());
			return;
		}

		if (hasRate) {
			try {
				await pb.authedClient.collection('exchangeRates').create({
					owner: currentOwnerId,
					currency: currencyCode,
					date: todayUtcIso(),
					rate: rateValue
				});
			} catch (error) {
				logError('addCurrency', 'create_quote', error);
				toast.error(m.currencies_quote_add_failed());
				await goto(resolve('/currencies'));
				return;
			}
		}

		toast.success(m.currencies_add_success());
		await goto(resolve('/currencies'));
	}
</script>

<Page
	pageTitle={m.currencies_add_page_title()}
	crumbs={[
		{ label: m.sidebar_currencies(), href: resolve('/currencies') },
		{ label: m.currencies_add_page_title() }
	]}
>
	<Section>
		<SectionTitle title={m.currencies_section_details()} />

		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="code" class="justify-start pr-0 md:justify-end">
							{m.currencies_label_code()}
						</Label>
						<Input
							id="code"
							value={code}
							pattern={codePatternAttribute}
							placeholder={m.currencies_placeholder_code()}
							required
							oninput={handleCodeInput}
							class="bg-background"
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="name" class="justify-start pr-0 md:justify-end">
								{m.currencies_label_name()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.currencies_text_optional()}</span>
						</div>
						<Input
							id="name"
							bind:value={name}
							placeholder={m.currencies_placeholder_name()}
							class="bg-background"
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="preview" class="justify-start pr-0 md:justify-end">
							{m.currencies_label_preview()}
						</Label>
						{#if isIntlPreviewCode}
							<CurrencyField id="preview" value={previewAmount} currency={previewCode} disabled />
						{:else}
							<Input
								id="preview"
								value={previewValue}
								disabled
								class="bg-background disabled:bg-border/33 font-mono disabled:shadow-none"
							/>
						{/if}
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label class="justify-start pr-0 md:justify-end">
							{m.currencies_label_mark_as()}
						</Label>
						<CheckboxLabel
							id="auto-update"
							bind:checked={autoUpdate}
							label={m.currencies_label_auto_update()}
						/>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="rate" class="justify-start pr-0 md:justify-end">
								{m.currencies_label_usd_exchange_rate()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.currencies_text_optional()}</span>
						</div>
						<CurrencyField id="rate" name="rate" bind:value={rate} currency={previewCode} />
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={!canSubmit}>{m.currencies_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
