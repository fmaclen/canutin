<script lang="ts">
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';

	let { children } = $props();
</script>

<GuestBackdrop />
<div class="relative">
	{@render children?.()}
</div>
