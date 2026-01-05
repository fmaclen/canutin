<script lang="ts">
	let { title = '' }: { title: string } = $props();
</script>

<div
	class="text-muted-foreground flex h-7 w-full items-center font-mono font-normal tracking-widest uppercase"
>
	{title}
</div>
