<script lang="ts">
	import UsersIcon from '@lucide/svelte/icons/users';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	interface Props {
		label?: string;
		class?: string;
	}

	let { label = 'Shared', class: className = '' }: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger class={'text-muted-foreground inline-flex shrink-0 ' + className}>
		<UsersIcon class="size-3.5" aria-label={label} />
	</Tooltip.Trigger>
	<Tooltip.Content sideOffset={6}>
		<p class="text-xs leading-snug font-normal">{label}</p>
	</Tooltip.Content>
</Tooltip.Root>
