<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- Children sit on an 8px rhythm. A section title reads as ~14px of air below it because its
     centered 28px box leaves glyph slack; solid-surface children - filter bars, summary card grids,
     selection bars - have none, so each one followed by a sibling sets its own `max-sm` bottom
     margin to reach that same ~14px on phones.
     The value depends on how the parent separates its children. `space-y-*` compiles to a
     `margin-block-end` on the child itself inside a zero-specificity `:where()`, so a margin
     utility REPLACES the 8px rather than adding to it and must carry the full `max-sm:mb-3.5`.
     A `gap-*` parent - the section title's flex row, `Tabs.Root` - leaves the child's margin
     intact and adds to it, so `max-sm:mb-1.5` is enough there. Above `sm` neither applies. -->
<section class="mx-auto flex w-full flex-col space-y-2">
	{@render children?.()}
</section>
