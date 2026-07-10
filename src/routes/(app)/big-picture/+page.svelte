<script lang="ts">
	import { onDestroy } from 'svelte';

	import { setCashflowContext } from '$lib/cashflow.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import Cashflow from './cashflow.svelte';
	import Summary from './summary.svelte';
	import TrailingCashflow from './trailing-cashflow.svelte';

	const pb = getPocketBaseContext();
	const cashflowContext = setCashflowContext(pb);

	onDestroy(() => {
		cashflowContext.dispose();
	});
</script>

<Page pageTitle={m.sidebar_big_picture()}>
	<Section>
		<SectionTitle title={m.big_picture_section_summary()} />
		<Summary />
	</Section>

	<Section>
		<SectionTitle title={m.cashflow_section_title()} />
		<Cashflow />
	</Section>

	<Section>
		<TrailingCashflow />
	</Section>
</Page>
