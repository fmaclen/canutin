<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const TOOLTIP_TOUCH_KEY = Symbol('tooltip-touch');

	export function getTooltipTouchOpener() {
		return getContext<() => void>(TOOLTIP_TOUCH_KEY);
	}
</script>

<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';

	let { open = $bindable(false), ...restProps }: TooltipPrimitive.RootProps = $props();

	// A tap produces no pointer hover for bits-ui to open on, and the click it ends with would close
	// whatever the trigger's focus did manage to open, so on touch the tooltip only flashes. The
	// trigger opens this state directly instead (see tooltip-trigger.svelte); while a tap is what
	// opened it, bits-ui's close-on-click is switched off so the same tap can't take it straight
	// back, and the content's dismissible layer closes it when the next tap lands outside. A mouse
	// click still closes the tooltip the way bits-ui intends.
	let isOpenedByTouch = $state(false);
	setContext(TOOLTIP_TOUCH_KEY, () => {
		isOpenedByTouch = true;
		open = true;
	});
	$effect(() => {
		if (!open) isOpenedByTouch = false;
	});
</script>

<TooltipPrimitive.Root bind:open disableCloseOnTriggerClick={isOpenedByTouch} {...restProps} />
