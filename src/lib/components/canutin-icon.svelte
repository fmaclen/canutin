<script lang="ts">
	import { cn } from "$lib/utils";

	let {
    class: className,
		fill = 'white'
	}: {
    class: string
		fill?: 'white' | 'black' | 'brand';
	} = $props();
</script>

<svg class={cn(className)} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
	<path
		fill-rule="evenodd"
		clip-rule="evenodd"
		d="M3.4021 20.171C-1.13403 24.7071 -1.13403 32.0616 3.4021 36.5978C7.93823 41.1339 15.2928 41.1339 19.8289 36.5978L36.5979 19.8288C41.134 15.2926 41.134 7.93811 36.5979 3.40198C32.0618 -1.13415 24.7073 -1.13416 20.1711 3.40197L3.4021 20.171ZM33.3833 16.9278C36.2256 14.0855 36.2256 9.47724 33.3833 6.63496C30.541 3.79268 25.9328 3.79268 23.0905 6.63496C20.2482 9.47724 20.2482 14.0855 23.0905 16.9278C25.9328 19.77 30.541 19.77 33.3833 16.9278Z"
		fill={fill === 'brand' ? 'var(--color-brand)' : fill === 'black' ? '#000000' : '#FFFFFF'}
	/>
</svg>
