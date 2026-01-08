<script lang="ts">
	import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLThAttributes } from 'svelte/elements';

	import { cn, type SortDirection, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLThAttributes> {
		column: string;
		sortColumn: string | null;
		sortDirection: SortDirection | null;
		onSort: (column: string) => void;
		children?: Snippet;
	}

	let {
		ref = $bindable(null),
		class: className,
		column,
		sortColumn,
		sortDirection,
		onSort,
		children,
		...restProps
	}: Props = $props();

	const isActive = $derived(sortColumn === column);
	const ariaSort = $derived.by(() => {
		if (!isActive || !sortDirection) return undefined;
		return sortDirection === 'asc' ? 'ascending' : 'descending';
	});
</script>

<th
	bind:this={ref}
	data-slot="table-head"
	class={cn(
		'text-muted-foreground h-10 bg-clip-padding px-4 py-2 text-left align-middle text-xs font-normal whitespace-nowrap [&:has([role=checkbox])]:pr-0',
		className
	)}
	aria-sort={ariaSort}
	{...restProps}
>
	<button
		type="button"
		class={cn(
			'-ml-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-white/5',
			isActive ? 'text-foreground bg-white/5' : 'hover:text-foreground'
		)}
		onclick={() => onSort(column)}
	>
		{@render children?.()}
		{#if isActive && sortDirection === 'asc'}
			<ArrowUp class="size-3.5" />
		{:else if isActive && sortDirection === 'desc'}
			<ArrowDown class="size-3.5" />
		{:else}
			<ArrowUpDown class="size-3.5 opacity-50" />
		{/if}
	</button>
</th>
