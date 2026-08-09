<script lang="ts" module>
	import type { BadgeVariant } from '$lib/components/ui/badge/badge.svelte';
	import { m } from '$lib/paraglide/messages';
	import { ImportSessionsStatusOptions } from '$lib/pocketbase.schema';

	const variants: Record<ImportSessionsStatusOptions, BadgeVariant> = {
		[ImportSessionsStatusOptions.completed]: 'positive',
		[ImportSessionsStatusOptions.completed_with_errors]: 'warning',
		[ImportSessionsStatusOptions.failed]: 'negative',
		[ImportSessionsStatusOptions.pending]: 'outline',
		[ImportSessionsStatusOptions.rolled_back]: 'outline'
	};

	const labels: Record<ImportSessionsStatusOptions, () => string> = {
		[ImportSessionsStatusOptions.completed]: m.settings_imports_status_completed,
		[ImportSessionsStatusOptions.completed_with_errors]:
			m.settings_imports_status_completed_with_errors,
		[ImportSessionsStatusOptions.failed]: m.settings_imports_status_failed,
		[ImportSessionsStatusOptions.pending]: m.settings_imports_status_pending,
		[ImportSessionsStatusOptions.rolled_back]: m.settings_imports_status_rolled_back
	};
</script>

<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { status }: { status: ImportSessionsStatusOptions } = $props();
</script>

<Badge variant={variants[status]}>{labels[status]()}</Badge>
