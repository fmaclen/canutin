<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();
</script>

{#snippet Fallback()}
	<ChevronLeftIcon class="size-4" />
	<span>{m.pagination_previous_label()}</span>
{/snippet}

<PaginationPrimitive.PrevButton
	bind:ref
	aria-label={m.pagination_previous_aria_label()}
	class={cn(
		buttonVariants({
			size: 'default',
			variant: 'ghost',
			class: 'gap-1 px-2.5 sm:pl-2.5'
		}),
		className
	)}
	children={children || Fallback}
	{...restProps}
/>
