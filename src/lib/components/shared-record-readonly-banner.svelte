<script lang="ts">
	import UsersIcon from '@lucide/svelte/icons/users';

	import Notice from '$lib/components/notice.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		title: string;
	}

	let { title }: Props = $props();
</script>

<Notice variant="warning">
	<div class="flex items-center gap-2 p-4">
		<UsersIcon class="text-muted-foreground size-3.5" aria-hidden="true" />
		<div>
			<p class="text-sm font-semibold">{title}</p>
			<p class="text-muted-foreground text-sm">
				{m.shared_record_readonly_subtext()}
			</p>
		</div>
	</div>
</Notice>
