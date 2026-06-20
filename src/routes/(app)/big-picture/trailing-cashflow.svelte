<script lang="ts">
	import { getCashflowContext } from '$lib/cashflow.svelte';
	import TrailingCashflow from '$lib/components/trailing-cashflow.svelte';

	const cashflow = getCashflowContext();
</script>

<TrailingCashflow
	avg3m={cashflow.avg3m}
	avg6m={cashflow.avg6m}
	avgYtd={cashflow.avgYtd}
	avg1y={cashflow.avg1y}
/>
