<script lang="ts">
	// Contained pins the backdrop to the nearest positioned ancestor instead of the viewport, so a
	// route inside the app shell can fill its content area without covering the sidebar.
	let { contained = false }: { contained?: boolean } = $props();

	const id = $props.id();

	// The grid is drawn rotated so each 45 degree line of marks is simply a row. STEP is the lattice
	// spacing both along a line and between lines, and also the drift distance - a layer has to
	// travel exactly one period to loop seamlessly.
	const STEP = 135.7645;

	// Rotation is about the top-left origin, so the grid has to overshoot the viewport.
	const REACH = 5000;

	// Each group owns every fourth line, so varying the speeds costs four layers rather than one
	// per line.
	const groups = [
		{ duration: '9.6s' },
		{ duration: '16.8s' },
		{ duration: '30.4s' },
		{ duration: '54.4s' }
	];
</script>

<!-- The surface colour is owned here so the guest routes and the setup splash share it; the splash
     renders outside the app's own background wrapper. -->
<div
	aria-hidden="true"
	class="bg-secondary pointer-events-none inset-0 {contained ? 'absolute' : 'fixed'}"
></div>

<svg
	aria-hidden="true"
	class="fade pointer-events-none inset-0 h-full w-full {contained ? 'absolute' : 'fixed'}"
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<!-- The hole is a separate circle, deliberately smaller than the logo's, to keep the two
		     contours legible at pattern scale. -->
		<g id="iso-{id}" transform="scale(0.6)" fill="none" stroke-width="2">
			<path
				d="M3.4021 20.171C-1.13403 24.7071 -1.13403 32.0616 3.4021 36.5978C7.93823 41.1339 15.2928 41.1339 19.8289 36.5978L36.5979 19.8288C41.134 15.2926 41.134 7.93811 36.5979 3.40198C32.0618 -1.13415 24.7073 -1.13416 20.1711 3.40197L3.4021 20.171Z"
			/>
			<circle cx="28.2369" cy="11.7814" r="4.9" />
		</g>

		<!-- Carved, not raised: shadow on the outline, highlight 1px below it. Custom properties
		     rather than `dark:` classes - utility selectors don't match cloned content inside a
		     <use>, so a class-based theme silently never applies here. -->
		<g id="mark-{id}">
			<use href="#iso-{id}" y="1" style="stroke: var(--mark-highlight)" />
			<use href="#iso-{id}" style="stroke: var(--mark-shadow)" />
		</g>

		<!-- Counter-rotated so the mark stays upright inside the tilted grid. -->
		<g id="tilted-mark-{id}" transform="rotate(45)">
			<use href="#mark-{id}" x="-12" y="-12" />
		</g>
	</defs>

	<!-- Inside here the x axis runs up and to the right, so a layer drifting along it slides each
	     line along its own diagonal. -->
	<g transform="rotate(-45)">
		{#each groups as group, index (index)}
			<pattern
				id="pattern-{index}-{id}"
				width={STEP}
				height={STEP * groups.length}
				patternUnits="userSpaceOnUse"
			>
				<use href="#tilted-mark-{id}" x={STEP / 2} y={index * STEP + STEP / 2} />
			</pattern>
			<rect
				class="drift"
				style="--step: {STEP}px; animation-duration: {group.duration}"
				x={-REACH}
				y={-REACH}
				width={REACH * 2}
				height={REACH * 2}
				fill="url(#pattern-{index}-{id})"
			/>
		{/each}
	</g>
</svg>

<style>
	/* A true circle, not an SVG gradient mask - that would follow the element's aspect ratio and
	   collapse the clear centre to a sliver on phone-shaped viewports. Alpha is what masks, so the
	   transparent stop is the one that hides the pattern. */
	.fade {
		--mark-shadow: color-mix(in oklab, var(--color-neutral-300) 70%, transparent);
		--mark-highlight: var(--color-white);

		mask-image: radial-gradient(
			circle at 50% 50%,
			transparent 0 clamp(160px, 12vmax, 260px),
			black clamp(420px, 34vmax, 780px)
		);
	}

	:global(.dark) .fade {
		--mark-shadow: var(--color-neutral-900);
		--mark-highlight: color-mix(in oklab, var(--color-neutral-600) 60%, transparent);
	}

	.drift {
		animation: drift linear infinite;
	}

	@keyframes drift {
		to {
			transform: translateX(var(--step));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drift {
			animation: none;
		}
	}
</style>
