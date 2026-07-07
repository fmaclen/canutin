<script lang="ts">
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	let { children, class: className }: { children: Snippet; class?: string } = $props();
</script>

<div
	class={cn(
		'bg-border text-muted-foreground flex min-h-32 items-center justify-center rounded-sm border p-6 text-sm',
		className
	)}
>
	{@render children()}
</div>
