<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(
		'bg-sidebar-ring/10 text-muted-foreground inline-flex h-8 w-fit items-center justify-center rounded-sm p-1',
		className
	)}
	{...restProps}
/>
