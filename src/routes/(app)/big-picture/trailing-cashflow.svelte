<script lang="ts">
	import { getCashflowContext } from '$lib/cashflow.svelte';
	import CashflowAverages from '$lib/components/cashflow-averages.svelte';

	const cashflow = getCashflowContext();
</script>

<CashflowAverages
	avg3m={cashflow.avg3m}
	avg6m={cashflow.avg6m}
	avgYtd={cashflow.avgYtd}
	avg1y={cashflow.avg1y}
/>
