<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<!-- A control that declares `w-full` below `sm` (the period tabs) drops onto its own row under the
     title on phones, where the title and seven segments can't share a line. Controls that still fit
     inline - links, short tab lists - stay on the title's row. Above `sm` nothing ever wraps.
     The visual reference for stacked spacing is a title-only section, where the title's centered
     28px box plus the section's 8px rhythm read as ~14px of air above the content. The 12px row
     gap (plus ~2px glyph slack; `leading-none` strips the rest) hits that same ~14px above the
     stacked control, and the control's own `max-sm` bottom margin hits it below. -->
<div
	class="flex min-h-7 w-full flex-wrap items-center justify-between gap-x-2 gap-y-3 sm:flex-nowrap"
>
	<h2 class="text-muted-foreground font-mono leading-none font-normal tracking-widest uppercase">
		{title}
	</h2>
	{@render children?.()}
</div>
