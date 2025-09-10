<script lang="ts">
	interface Props {
		value: string | number | null;
	}

	let { value }: Props = $props();
</script>

{#if value}
	<span class="font-jetbrains-mono text-inherit uppercase">{value}</span>
{:else}
	~
{/if}
