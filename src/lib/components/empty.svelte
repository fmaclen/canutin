<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div
	class="bg-border text-muted-foreground flex min-h-32 items-center justify-center rounded-sm border p-6 text-sm"
>
	{@render children()}
</div>
