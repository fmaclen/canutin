<script lang="ts">
	import { CurrencyInput, formatValue } from '@canutin/svelte-currency-input';

	import { intlConfig } from './currency';

	interface Props {
		id: string;
		name?: string;
		value: string;
		required?: boolean;
	}

	let { id, name, value = $bindable(), required = false }: Props = $props();

	const placeholder = formatValue({ value: '0', intlConfig, decimalScale: 2 });

	const baseClass =
		'border-input bg-background ring-offset-background selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] font-mono';

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
	bind:value
	{required}
	{intlConfig}
	{placeholder}
	decimalScale={2}
	class="{baseClass} {getValueColor(value)}"
/>
