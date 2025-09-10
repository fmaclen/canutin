<script lang="ts">
	let { title = '' }: { title: string } = $props();
</script>

<div
	class="h-8px-2 text-muted-foreground bg-muted flex h-9 w-full items-center rounded px-2 py-1 text-xs font-medium"
>
	{title}
</div>
