<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		isFirst = false,
		children
	}: {
		isFirst?: boolean;
		children: Snippet;
	} = $props();
</script>

<fieldset class="space-y-6 {isFirst ? 'border-0' : 'border-border border-t'} p-4 md:space-y-4">
	{@render children()}
</fieldset>
