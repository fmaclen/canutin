<script lang="ts">
	import { initLocaleFromStorageOrAPI } from '$lib/i18n';
	import { type Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	$effect(() => {
		initLocaleFromStorageOrAPI();
	});
</script>

{@render children()}
