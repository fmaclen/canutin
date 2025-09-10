<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { m } from '$lib/paraglide/messages';

	import Summary from './summary.svelte';
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
		<Tabs.Root value="six-months">
			<nav class="flex items-center justify-between space-x-2">
				<SectionTitle title="Trailing cashflow" />

				<Tabs.List>
					<Tabs.Trigger value="three-months">3M</Tabs.Trigger>
					<Tabs.Trigger value="six-months">6M</Tabs.Trigger>
					<Tabs.Trigger value="nine-months">YTD</Tabs.Trigger>
					<Tabs.Trigger value="one-year">1Y</Tabs.Trigger>
					<Tabs.Trigger value="two-years">2Y</Tabs.Trigger>
				</Tabs.List>
			</nav>
			<Tabs.Content value="three-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					<KeyValue title="Income per month" value={15000} />
					<KeyValue title="Expenses per month" value={10000} />
					<KeyValue title="Surplus per month" value={5000} />
				</div>
			</Tabs.Content>
			<Tabs.Content value="six-months">
				<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
					<KeyValue title="Income per month" value={15000} />
					<KeyValue title="Expenses per month" value={10000} />
					<KeyValue title="Surplus per month" value={5000} />
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</section>
</div>
