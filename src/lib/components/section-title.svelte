<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title = '', children }: { title?: string; children?: Snippet } = $props();
</script>

<div class="flex h-7 w-full items-center justify-between gap-2">
	{#if title}
		<h2 class="text-muted-foreground font-mono font-normal tracking-widest uppercase">
			{title}
		</h2>
	{/if}
	{@render children?.()}
</div>
