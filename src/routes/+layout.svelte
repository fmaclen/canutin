<script lang="ts">
	import { type Snippet } from 'svelte';

	import { initLocaleFromStorageOrAPI } from '$lib/i18n';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	$effect(() => {
		initLocaleFromStorageOrAPI();
	});
</script>

{@render children()}
