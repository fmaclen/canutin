<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		count = 0,
		perPage = 10,
		page = $bindable(1),
		siblingCount,
		...restProps
	}: PaginationPrimitive.RootProps = $props();

	// Phones drop the pages beside the current one so the controls always fit a single row
	const isPhone = new IsMobile(640);
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
	siblingCount={siblingCount ?? (isPhone.current ? 0 : 1)}
	{...restProps}
/>
