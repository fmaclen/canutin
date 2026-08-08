<script lang="ts">
	const id = $props.id();

	// The marks sit on a square lattice aligned to the 45 degree diagonals, so the whole grid is
	// drawn in a rotated space where each diagonal line is simply a row. STEP is that lattice's
	// spacing - 96√2, the diagonal of the 96px half-tile the untilted grid used - and it is both the
	// gap between marks along a line and the gap between neighbouring lines.
	const STEP = 135.7645;

	// Rotation is about the SVG's top-left origin, so the tilted grid has to reach well past the
	// viewport in every direction to still cover the far corner.
	const REACH = 5000;

	// Every line travels along itself at its own speed. Lines are grouped so this stays four
	// animated layers rather than one per line; each group owns every fourth line.
	const groups = [
		{ duration: '9.6s' },
		{ duration: '16.8s' },
		{ duration: '30.4s' },
		{ duration: '54.4s' }
	];
</script>

<!-- The surface colour lives here rather than on each caller: the guest routes render inside the
     app's own background wrapper and the setup splash renders outside it, so owning both layers
     keeps the two entry points on the same surface. -->
<div aria-hidden="true" class="bg-secondary pointer-events-none fixed inset-0"></div>

<svg
	aria-hidden="true"
	class="fade pointer-events-none fixed inset-0 h-full w-full"
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<!-- The iso is split into its pill and its hole so the hole can be drawn smaller than the
		     logo's, leaving more breathing room between the two contours at pattern scale. -->
		<g id="iso-{id}" transform="scale(0.6)" fill="none" stroke-width="2">
			<path
				d="M3.4021 20.171C-1.13403 24.7071 -1.13403 32.0616 3.4021 36.5978C7.93823 41.1339 15.2928 41.1339 19.8289 36.5978L36.5979 19.8288C41.134 15.2926 41.134 7.93811 36.5979 3.40198C32.0618 -1.13415 24.7073 -1.13416 20.1711 3.40197L3.4021 20.171Z"
			/>
			<circle cx="28.2369" cy="11.7814" r="4.9" />
		</g>

		<!-- Carved, not raised: the shadow sits on the outline and the highlight 1px below it, as if
		     lit from above. Which colour plays each part flips with the theme, since a highlight is
		     lighter than the page in dark mode and the shadow is darker than it in light mode. -->
		<g id="mark-{id}">
			<use href="#iso-{id}" y="1" class="stroke-white dark:stroke-neutral-600/60" />
			<use href="#iso-{id}" class="stroke-neutral-300/70 dark:stroke-neutral-900" />
		</g>

		<!-- Centred on its own origin and counter-rotated, so it keeps its upright screen orientation
		     once the grid around it is tilted. -->
		<g id="tilted-mark-{id}" transform="rotate(45)">
			<use href="#mark-{id}" x="-12" y="-12" />
		</g>
	</defs>

	<!-- Tilting the grid rather than the marks: inside here the x axis runs up and to the right, so
	     a layer travelling along it slides each line along its own diagonal. One STEP is a whole
	     lattice period, so every layer loops seamlessly no matter how fast it moves. -->
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
	/* Deliberately a true circle sized off the larger viewport edge. An SVG gradient mask follows
	   the element's aspect ratio, which collapses the clear centre to a sliver on phone-shaped
	   viewports and puts marks straight through the form. CSS masks key off alpha, so the
	   transparent stop is the one that hides the pattern. */
	.fade {
		mask-image: radial-gradient(
			circle at 50% 50%,
			transparent 0 clamp(160px, 12vmax, 260px),
			black clamp(420px, 34vmax, 780px)
		);
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
