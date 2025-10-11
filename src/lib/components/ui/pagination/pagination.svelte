<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		count = 0,
		perPage = 10,
		page = $bindable(1),
		siblingCount = 1,
		...restProps
	}: PaginationPrimitive.RootProps = $props();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	role="navigation"
	aria-label={m.pagination_navigation_label()}
	data-slot="pagination"
	class={cn('mx-auto flex w-full justify-center', className)}
	{count}
	{perPage}
	{siblingCount}
	{...restProps}
/>
