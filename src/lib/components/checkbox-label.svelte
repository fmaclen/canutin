<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { cn } from '$lib/utils';

	interface Props {
		id?: string;
		checked: boolean;
		disabled?: boolean;
		indeterminate?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		label: string;
		class?: string;
	}

	let {
		id,
		checked = $bindable(),
		disabled = false,
		indeterminate = false,
		onCheckedChange,
		label,
		class: className
	}: Props = $props();
</script>

<Label
	for={id}
	class={cn(
		'flex h-9 shrink-0 items-center gap-2 rounded border px-2.5 py-1 font-normal',
		disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
		className
	)}
>
	<Checkbox {id} bind:checked {disabled} {indeterminate} {onCheckedChange} class="bg-background" />
	<span class="text-sm">{label}</span>
</Label>
