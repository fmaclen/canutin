<script lang="ts">
	const id = $props.id();
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
			<use href="#iso-{id}" class="stroke-neutral-300/60 dark:stroke-neutral-900" />
		</g>

		<!-- Two marks a half-tile apart on both axes tile into a staggered grid:
		     columns every 192px, rows every 96px, alternate rows offset by half a column. -->
		<pattern id="pattern-{id}" width="192" height="192" patternUnits="userSpaceOnUse">
			<use href="#mark-{id}" x="39" y="39" />
			<use href="#mark-{id}" x="135" y="135" />
		</pattern>
	</defs>

	<!-- The mask stays put while the pattern drifts inside it. The rect is oversized so the
	     translation never exposes an edge, and the drift runs along the mark's own axis by one
	     diagonal tile repeat, which the staggered grid is invariant under, so the loop is seamless. -->
	<rect class="drift" x="-50%" y="-50%" width="200%" height="200%" fill="url(#pattern-{id})" />
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
		animation: drift 19s linear infinite;
	}

	@keyframes drift {
		to {
			transform: translate(96px, -96px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drift {
			animation: none;
		}
	}
</style>
