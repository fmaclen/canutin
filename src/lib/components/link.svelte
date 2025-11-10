<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		href,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> = $props();
</script>

<a
	bind:this={ref}
	{href}
	class={cn(
		'border-foreground/20 hover:text-primary hover:border-primary border-b transition-colors [text-decoration:none]',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</a>
