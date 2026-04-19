<script lang="ts">
	import { page } from '$app/state';
	import Link from '$lib/components/link.svelte';
	import SharedIndicator from '$lib/components/shared-indicator.svelte';

	interface Props {
		type: 'account' | 'asset';
		id: string;
		name: string;
		isShared?: boolean;
		class?: string;
		wrapperClass?: string;
	}

	let {
		type,
		id,
		name,
		isShared = false,
		class: className = '',
		wrapperClass = ''
	}: Props = $props();

	const basePath = $derived(type === 'account' ? `/accounts/${id}` : `/assets/${id}`);
	const href = $derived.by(() => {
		const currentUrl = page.url;
		if (!currentUrl) return basePath;
		const from = currentUrl.pathname + currentUrl.search;
		return `${basePath}?from=${encodeURIComponent(from)}`;
	});
	const sharedLabel = $derived(type === 'account' ? 'Shared account' : 'Shared asset');
</script>

<div class={'flex items-center gap-2 ' + wrapperClass}>
	<Link {href} class={className}>{name}</Link>
	{#if isShared}
		<SharedIndicator label={sharedLabel} />
	{/if}
</div>
