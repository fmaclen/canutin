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
		'text-foreground/90 decoration-foreground/20 hover:text-brand hover:decoration-brand inline-block leading-tight underline underline-offset-4 transition-colors',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</a>
