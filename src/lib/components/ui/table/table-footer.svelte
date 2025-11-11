<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<tfoot
	bind:this={ref}
	data-slot="table-footer"
	class={cn(
		'bg-muted/50 [&>tr>td]:!bg-muted [&>tr]:hover:[&>tr>td]:!bg-muted border-t font-medium [&>tr]:sticky [&>tr]:bottom-0 [&>tr]:last:border-b-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tfoot>
