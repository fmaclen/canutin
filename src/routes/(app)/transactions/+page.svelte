<script lang='ts'>
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
</script>

<header class='bg-background flex h-16 shrink-0 items-center gap-2 border-b'>
	<div class='flex items-center gap-2 px-4'>
		<Sidebar.Trigger class='-ml-1' />
		<Separator orientation='vertical' class='mr-2 data-[orientation=vertical]:h-4' />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_transactions()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

