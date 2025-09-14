<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		'data-[state=selected]:bg-muted hover:[&,&>svelte-css-wrapper]:[&>td]:bg-brand-secondary odd:[&>td]:bg-primary-foreground transition-colors [&>td]:border-b [&>td]:border-dashed [&>td]:py-3 last:[&>td]:border-b-0 last:[&>td:first-child]:rounded-bl-md last:[&>td:last-child]:rounded-br-md',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
