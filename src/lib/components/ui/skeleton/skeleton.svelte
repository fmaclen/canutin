<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		showSpinner = false,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> & {
		showSpinner?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="skeleton"
	class={cn('bg-border relative animate-pulse overflow-hidden rounded', className)}
	{...restProps}
>
	{#if showSpinner}
		<LoaderCircleIcon
			aria-hidden="true"
			class="text-muted-foreground/70 absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-spin"
		/>
	{/if}
</div>
