<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';

	let {
		onclick,
		onpointerdown,
		onpointerup,
		class: className,
		'aria-label': ariaLabel
	}: {
		onclick: (e: MouseEvent) => void;
		onpointerdown?: (e: PointerEvent) => void;
		onpointerup?: (e: PointerEvent) => void;
		class?: string;
		'aria-label': string;
	} = $props();
</script>

<button
	type="button"
	{onclick}
	{onpointerdown}
	{onpointerup}
	aria-label={ariaLabel}
	class="text-muted-foreground hover:text-foreground cursor-pointer {className ?? ''}"
>
	<XIcon class="size-4" />
</button>
