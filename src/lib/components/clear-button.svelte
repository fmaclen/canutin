<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';

	let {
		onclick,
		onpointerdown,
		'aria-label': ariaLabel
	}: {
		onclick: (e: MouseEvent) => void;
		onpointerdown?: (e: PointerEvent) => void;
		'aria-label': string;
	} = $props();
</script>

<button
	type="button"
	{onclick}
	{onpointerdown}
	aria-label={ariaLabel}
	class="text-muted-foreground hover:text-foreground cursor-pointer"
>
	<XIcon class="size-4" />
</button>
