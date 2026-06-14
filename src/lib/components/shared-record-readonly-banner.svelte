<script lang="ts">
	import UsersIcon from '@lucide/svelte/icons/users';

	import { m } from '$lib/paraglide/messages';

	interface Props {
		title: string;
	}

	let { title }: Props = $props();
</script>

<div class="bg-muted border-border overflow-hidden rounded border">
	<div class="flex items-center justify-between p-4">
		<div>
			<p class="flex items-center gap-2 text-sm">
				<UsersIcon class="text-muted-foreground size-3.5" aria-hidden="true" />
				{title}
			</p>
			<p class="text-muted-foreground text-sm">
				{m.shared_record_readonly_subtext()}
			</p>
		</div>
	</div>
</div>
