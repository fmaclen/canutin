<script lang="ts">
	import UsersIcon from '@lucide/svelte/icons/users';

	import { m } from '$lib/paraglide/messages';

	interface Props {
		title: string;
	}

	let { title }: Props = $props();
</script>

<div class="bg-muted border-border overflow-hidden rounded border border-l-4 border-l-amber-500">
	<div class="flex items-center gap-2 p-4">
		<UsersIcon class="text-muted-foreground size-3.5" aria-hidden="true" />
		<div>
			<p class="text-sm font-semibold">{title}</p>
			<p class="text-muted-foreground text-sm">
				{m.shared_record_readonly_subtext()}
			</p>
		</div>
	</div>
</div>
