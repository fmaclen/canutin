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

<!-- On phones the tabs sit closer together and, when they still don't fit (longer translations),
     the row scrolls sideways out to the screen edges instead of wrapping -->
<nav
	class="text-muted-foreground flex min-w-0 items-center gap-6 max-md:-mx-4 max-md:gap-4 max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none] [&>a]:shrink-0 [&>a]:whitespace-nowrap"
>
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
