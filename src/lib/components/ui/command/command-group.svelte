<script lang="ts">
	import { Command as CommandPrimitive, useId } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		heading,
		headingContent,
		value,
		...restProps
	}: CommandPrimitive.GroupProps & {
		heading?: string;
		headingContent?: Snippet;
	} = $props();
</script>

<CommandPrimitive.Group
	bind:ref
	data-slot="command-group"
	class={cn('text-foreground overflow-hidden p-1', className)}
	value={value ?? heading ?? `----${useId()}`}
	{...restProps}
>
	{#if headingContent || heading}
		<CommandPrimitive.GroupHeading
			class="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs font-medium"
		>
			{#if headingContent}
				{@render headingContent()}
			{:else}
				{heading}
			{/if}
		</CommandPrimitive.GroupHeading>
	{/if}
	<CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>
