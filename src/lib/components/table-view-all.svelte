<script lang="ts">
	import Link from '$lib/components/link.svelte';

	let { href, label }: { href: string; label: string } = $props();
</script>

<!-- Sits below the table rather than inside it, so it spans the visible card instead of the
     table's scroll width and the label stays centred while a wide table scrolls sideways -->
<div class="bg-background border-t">
	<Link {href} class="block px-4 py-3 text-center text-sm no-underline">
		{label}
	</Link>
</div>
