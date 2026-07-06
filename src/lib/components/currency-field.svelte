<script lang="ts">
	import { CurrencyInput, formatValue } from '@canutin/svelte-currency-input';
	import { untrack } from 'svelte';

	import {
		getCurrencyLocale,
		getFormattingLocale,
		interfacePreferences
	} from '$lib/interface-preferences.svelte';

	import { isIntlCurrency } from './currency';

	interface Props {
		id: string;
		name?: string;
		value: string;
		required?: boolean;
		disabled?: boolean;
		isCurrency?: boolean;
		currency?: string;
	}

	let {
		id,
		name,
		value = $bindable(),
		required = false,
		disabled = false,
		isCurrency = true,
		currency
	}: Props = $props();

	// NOTE: native amounts format in the currency's home locale so an ARS field renders "-$ 26.800,00"
	// (how pesos are written) rather than the viewer-locale "-ARS 26,800.00". Non-Intl codes (crypto
	// tickers, custom codes) fall back to a plain decimal - Intl's currency style throws on anything
	// that isn't a 3-ASCII-letter code.
	const fieldCurrency = $derived(currency ?? interfacePreferences.displayCurrency);
	const fieldIntlConfig = $derived(
		!isCurrency
			? { locale: getFormattingLocale(), style: 'decimal' as const }
			: isIntlCurrency(fieldCurrency)
				? { locale: getCurrencyLocale(fieldCurrency), currency: fieldCurrency }
				: { locale: getCurrencyLocale(fieldCurrency), style: 'decimal' as const }
	);

	// NOTE: CurrencyInput writes back its locale's decimal separator (a comma for es-AR), but callers
	// parse `value` as a plain dot-decimal number. `editingValue` holds the library's locale-formatted
	// string for display; `value` is kept dot-decimal so parseFloat round-trips.
	const decimalSeparator = $derived(
		new Intl.NumberFormat(fieldIntlConfig.locale)
			.formatToParts(1.1)
			.find((part) => part.type === 'decimal')?.value ?? '.'
	);

	let editingValue = $state(value);

	$effect(() => {
		const incoming = value;
		const separator = decimalSeparator;
		untrack(() => {
			if (editingValue.replace(separator, '.') !== incoming) editingValue = incoming;
		});
	});

	function handleInput(values: { value: string }) {
		value = values.value.replace(decimalSeparator, '.');
	}

	const placeholder = $derived(
		formatValue({ value: '0', intlConfig: fieldIntlConfig, decimalScale: 2 })
	);

	const baseClass =
		'border-input bg-background ring-offset-background selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded border px-2 py-1 shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:bg-border/33 disabled:shadow-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] font-mono';

	function getValueColor(val: string) {
		if (!val || val === '-') return '';
		const num = parseFloat(val);
		if (num === 0) return '';
		return num < 0 ? 'text-rose-600' : 'text-emerald-600';
	}
</script>

<CurrencyInput
	{id}
	{name}
	bind:value={editingValue}
	{required}
	{disabled}
	intlConfig={fieldIntlConfig}
	{placeholder}
	decimalScale={2}
	oninputvalue={handleInput}
	onchangevalue={handleInput}
	class="{baseClass} {isCurrency ? getValueColor(value) : ''}"
/>
