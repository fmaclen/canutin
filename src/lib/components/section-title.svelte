<script lang="ts">
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<!-- A control that declares `w-full` below `sm` (the period tabs) drops onto its own row under the
     title on phones, where the title and seven segments can't share a line. Controls that still fit
     inline - links, short tab lists - stay on the title's row. Above `sm` nothing ever wraps.
     The visual reference for stacked spacing is a title-only section, where the title's centered
     28px box plus the section's 8px rhythm read as ~14px of air above the content. The 12px row
     gap (plus ~2px glyph slack; `leading-none` strips the rest) hits that same ~14px above the
     stacked control, and the control's own `max-sm` bottom margin hits it below.
     On phones titles are a size smaller, so a title with nothing beside it drops the 28px box and
     takes an 11px bottom margin instead (replacing the section's 8px), which keeps the same 14px
     between its letters and the content below. -->
<div
	class={cn(
		'flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-3 sm:flex-nowrap',
		children ? 'min-h-7' : 'max-sm:mb-2.75 sm:min-h-7'
	)}
>
	<h2
		class="text-muted-foreground font-mono leading-none font-normal tracking-widest uppercase max-sm:text-sm"
	>
		{title}
	</h2>
	{@render children?.()}
</div>
