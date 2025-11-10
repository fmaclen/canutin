<script lang="ts">
	import Currency from '$lib/components/currency.svelte';

	let {
		title = '',
		value = null,
		className
	}: { title: string; value: number | null; className?: string } = $props();
</script>

<div
	class="flex items-center justify-between rounded-sm p-4 shadow-md {className ?? 'bg-background'}"
	role="region"
	aria-label={title}
>
	<div class="text-sm font-semibold tracking-tight text-balance">{title}</div>
	<div class="font-mono text-sm tabular-nums">
		<Currency value={value ?? 0} />
	</div>
</div>
