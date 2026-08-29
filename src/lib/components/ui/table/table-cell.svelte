<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTdAttributes> = $props();
</script>

<!-- Below `sm` a cell never wraps - on a phone a wrapped value turns one row into several lines -
     and the padding between columns halves so the narrow width goes to content instead of gutters.
     The outer edges keep the 16px inset the charts align to, so only the inner gutters tighten.
     Cells holding free text pair this with `cell-truncate` (see app.css) to cap their width. -->
<td
	bind:this={ref}
	data-slot="table-cell"
	class={cn(
		'bg-clip-padding px-4 py-2 align-middle max-sm:whitespace-nowrap max-sm:not-first:pl-2.5 max-sm:not-last:pr-2.5 [&:has([role=checkbox])]:pr-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</td>
