<script lang="ts">
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	type Variant = 'info' | 'warning';

	interface Props {
		variant: Variant;
		class?: string;
		children: Snippet;
	}

	let { variant, class: className, children }: Props = $props();

	const variantBorderClasses: Record<Variant, string> = {
		info: 'border-l-primary',
		warning: 'border-l-amber-500'
	};
</script>

<div
	class={cn(
		'bg-muted border-border overflow-hidden rounded border border-l-4',
		variantBorderClasses[variant],
		className
	)}
>
	{@render children()}
</div>
