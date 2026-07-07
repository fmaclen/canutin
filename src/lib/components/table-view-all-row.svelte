<script lang="ts">
	import Link from '$lib/components/link.svelte';
	import * as Table from '$lib/components/ui/table/index';

	let { href, label, colspan }: { href: string; label: string; colspan: number } = $props();
</script>

<Table.Footer>
	<Table.Row class="border-t">
		<Table.Cell {colspan} class="bg-background p-0 whitespace-normal">
			<Link {href} class="block px-4 py-3 text-center text-sm no-underline">
				{label}
			</Link>
		</Table.Cell>
	</Table.Row>
</Table.Footer>
