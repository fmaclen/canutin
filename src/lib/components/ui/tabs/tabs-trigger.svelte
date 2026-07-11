<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"text-muted-foreground data-[state=active]:bg-brand focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring hover:text-foreground inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border border-transparent px-2 py-0 font-mono leading-none whitespace-nowrap uppercase transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
/>
