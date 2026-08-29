<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';

	import { getTooltipTouchOpener } from './tooltip.svelte';

	let { ref = $bindable(null), ...restProps }: TooltipPrimitive.TriggerProps = $props();

	const openOnTouch = getTooltipTouchOpener();
</script>

<TooltipPrimitive.Trigger
	bind:ref
	data-slot="tooltip-trigger"
	onpointerup={(event) => {
		// bits-ui only opens on pointer hover, which touch never produces; a completed tap is the
		// equivalent deliberate gesture
		if (event.pointerType !== 'mouse') openOnTouch();
	}}
	{...restProps}
/>
