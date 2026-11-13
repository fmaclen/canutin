<script lang="ts">
	import { cn } from '$lib/utils';

	type SubNavItem = { label: string; href: string; active: boolean };

	let { items }: { items: SubNavItem[] } = $props();

	// On phones each tab fills a row as tall as the bar above it (47px plus the header's 1px line)
	// and centers its label like the breadcrumbs do. A transparent top border mirrors the active
	// underline, so the underline doesn't push the label off center.
	const linkClass =
		'hover:text-brand inline-flex items-center border-b-2 border-transparent pb-4 text-sm leading-none transition-colors max-md:h-11.75 max-md:border-t-2 max-md:pb-0';
	const activeClass = 'text-foreground border-b-brand';
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
