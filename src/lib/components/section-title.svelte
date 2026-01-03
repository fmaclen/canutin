<script lang="ts">
	let { title = '' }: { title: string } = $props();
</script>

<div
	class="text-muted-foreground font-jetbrains-mono flex h-8 w-full items-center text-xs font-normal tracking-widest uppercase"
>
	{title}
</div>
