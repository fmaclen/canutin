<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot="input"
		class={cn(
			'border-input ring-offset-background selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground dark:bg-input/30 disabled:bg-border/33 flex h-9 w-full min-w-0 rounded border bg-transparent px-2 pt-1.5 text-sm font-medium transition-[color,box-shadow] outline-none disabled:cursor-not-allowed md:text-sm',
			'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else if type === 'date'}
	<!-- Chromium draws its calendar icon right after the date and iOS Safari draws none, so the field
	     shows this one at its right edge instead; app.css hides Chromium's and stretches it over this
	     icon so a click there still opens the picker -->
	<div class="relative w-full min-w-0">
		{@render field()}
		<CalendarIcon
			class="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
		/>
	</div>
{:else}
	{@render field()}
{/if}

{#snippet field()}
	<input
		bind:this={ref}
		data-slot="input"
		class={cn(
			'border-input bg-background ring-offset-background selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground dark:bg-input/30 disabled:bg-border/33 read-only:bg-border dark:read-only:bg-border flex h-9 w-full min-w-0 rounded border px-2 py-1 text-sm transition-[color,box-shadow] outline-none disabled:cursor-not-allowed',
			'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
			type === 'date' && 'pr-9',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/snippet}
