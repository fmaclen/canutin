<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import SectionTitle from '$lib/components/section-title.svelte';
  import KeyValue from '$lib/components/key-value.svelte';
</script>

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

