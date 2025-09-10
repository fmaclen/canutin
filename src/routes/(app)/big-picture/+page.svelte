<script lang="ts">
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';

	import Summary from './summary.svelte';
	import TrailingCashflow from './trailing-cashflow.svelte';
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item class="hidden md:block">
					<Breadcrumb.Page>{m.sidebar_big_picture()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<div class="flex flex-col space-y-10 px-6 py-8">
	<section class="mx-auto flex w-full flex-col space-y-2">
		<SectionTitle title="Summary" />
		<Summary />
	</section>

	<section class="mx-auto flex w-full flex-col space-y-2">
		<TrailingCashflow />
	</section>
</div>
