<script lang="ts">
	import { cn } from '$lib/utils';

	type SubNavItem = { label: string; href: string; active: boolean };

	let { items }: { items: SubNavItem[] } = $props();

	const linkClass =
		'hover:text-brand inline-flex items-center border-b-2 border-transparent pb-4 text-sm leading-none transition-colors';
	const activeClass = 'text-foreground border-brand';
</script>

<nav class="text-muted-foreground flex items-center gap-6">
	{#each items as item (item.href)}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- hrefs are resolved by callers -->
		<a
			href={item.href}
			aria-current={item.active ? 'page' : undefined}
			class={cn(linkClass, item.active && activeClass)}
		>
			{item.label}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/each}
</nav>
