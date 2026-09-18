<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Overscroll depth that reads as a deliberate tug; native iOS refreshes around 80 to 100px
	const threshold = 90;

	// A Home Screen web app has no reload button, so this is the only place the gesture applies
	const standalone = window.matchMedia('(display-mode: standalone)').matches;

	let touching = false;
	let pull = $state(0);
	let reloading = $state(false);
	const armed = $derived(pull >= threshold);

	function startTouch(event: TouchEvent) {
		if (!standalone || reloading) return;
		// A swipe that starts mid-page can carry through the top into a stretch; only a touch that
		// begins there is a pull
		touching = event.touches.length === 1 && window.scrollY < 1;
		pull = 0;
	}

	// iOS keeps its own rubber band at the top of the page and reports the stretch as a negative
	// scroll position on every scroll event, finger down included; that stretch is the pull
	function trackOverscroll() {
		if (!touching) return;
		pull = Math.max(0, -window.scrollY);
	}

	function endTouch(event: TouchEvent) {
		if (!touching) return;
		touching = false;
		// The finger lifts before the spring-back starts, so the stretch at this moment is what
		// decides; the browser cancelling the touch just lets go
		if (event.type === 'touchend' && armed) {
			reloading = true;
			window.location.reload();
			return;
		}
		pull = 0;
	}
</script>

<svelte:window onscroll={trackOverscroll} />

{#if pull > 0 || reloading}
	<div
		class="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center"
		style="opacity: {reloading ? 1 : Math.min(1, (2 * pull) / threshold)};"
		data-slot="pull-to-reload"
		data-state={armed ? 'armed' : 'pulling'}
		aria-hidden="true"
	>
		<div
			class="bg-background rounded-full p-2 shadow-md transition-[color,scale] duration-150 {armed
				? 'text-foreground scale-110'
				: 'text-muted-foreground'}"
		>
			<RefreshCwIcon
				class="size-5 {reloading ? 'animate-spin' : ''}"
				style="rotate: {pull * 2}deg;"
			/>
		</div>
	</div>
{/if}

<!-- The touch handlers live here rather than on the document so anything portaled to body -
     sheets, dialogs, popovers - and the sidebar are left alone -->
<div
	class="flex flex-1 flex-col"
	ontouchstart={startTouch}
	ontouchend={endTouch}
	ontouchcancel={endTouch}
>
	{@render children()}
</div>
