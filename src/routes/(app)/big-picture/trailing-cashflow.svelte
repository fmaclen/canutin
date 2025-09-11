<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import SectionTitle from '$lib/components/section-title.svelte';
  import KeyValue from '$lib/components/key-value.svelte';
  import { getPocketBaseClientContext } from '$lib/pocketbase.svelte';
  import { getAccountsContext } from '$lib/accounts.svelte';
  import { createKeyedBatchQueue } from '$lib/pocketbase.utils';
  import type { TransactionsResponse } from '$lib/pocketbase.schema';

  type Bucket = { income: number; expenses: number; surplus: number };

  const pbClient = getPocketBaseClientContext().client;
  const accountsContext = getAccountsContext();

  // Range: last 12 complete months [startInclusive, endExclusive)
  function monthStartUTC(y: number, m: number) {
    return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  }
  function addMonthsUTC(d: Date, delta: number) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0, 0));
  }
  const now = new Date();
  const endExclusive: Date = monthStartUTC(now.getUTCFullYear(), now.getUTCMonth());
  const startInclusive: Date = addMonthsUTC(endExclusive, -12);

  // Build canonical month keys (YYYY-MM) for the range
  function monthKeyFromDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  function rangeMonthKeys(start: Date, end: Date): string[] {
    const keys: string[] = [];
    for (let d = new Date(start); d < end; d = addMonthsUTC(d, 1)) keys.push(monthKeyFromDate(d));
    return keys;
  }
  const allMonths: string[] = rangeMonthKeys(startInclusive, endExclusive);

  // Allowed accounts derived from AccountsContext (exclude `excluded`).
  // Returns null until accounts are loaded to avoid filtering everything to 0.
  const allowedAccountIds: Set<string> | null = $derived.by(() => {
    if (!accountsContext.accounts.length) return null;
    const ids = new Set<string>();
    for (const a of accountsContext.accounts) if (!a.excluded) ids.add(a.id);
    return ids;
  });

  // Monthly buckets keyed by YYYY-MM
  let buckets: Record<string, Bucket> = $state({});

  // No accounts fetch here; we rely on AccountsContext and its realtime updates

  function initBuckets() {
    const next: Record<string, Bucket> = {};
    for (const k of allMonths) next[k] = { income: 0, expenses: 0, surplus: 0 };
    buckets = next;
  }

  function applyTxn(tx: TransactionsResponse) {
    if (!tx.date || tx.value == null) return;
    if (tx.excluded) return;
    if (tx.account && allowedAccountIds && !allowedAccountIds.has(tx.account)) return;

    const d = new Date(tx.date);
    // Only include within [startInclusive, endExclusive)
    if (!(d >= startInclusive && d < endExclusive)) return;

    const key = monthKeyFromDate(d);
    const b = buckets[key];
    if (!b) return;
    if (tx.value > 0) b.income += tx.value;
    else b.expenses += tx.value; // negative values accumulate
    b.surplus = b.income + b.expenses;
  }

  // Cache of transactions in range (id -> record)
  const transactionsById = new Map<string, TransactionsResponse>();

  function formatPBDateUTC(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    // Compare by whole day only (no time) to avoid precision mismatch
    return `${y}-${m}-${day}`;
  }

  async function loadInitialTransactions() {
    transactionsById.clear();
    const startStr = formatPBDateUTC(startInclusive);
    const endStr = formatPBDateUTC(endExclusive);
    const txs = await pbClient
      .collection('transactions')
      .getFullList<TransactionsResponse>({
        filter: `(date >= '${startStr}' && date < '${endStr}')`
      });
    for (const t of txs) transactionsById.set(t.id, t);
  }

  function rebuildFromCache() {
    initBuckets();
    for (const t of transactionsById.values()) applyTxn(t);
  }

  function sumAndAvg(keys: string[]): Bucket {
    const count = keys.length;
    if (count === 0) return { income: 0, expenses: 0, surplus: 0 };
    let income = 0;
    let expenses = 0;
    for (const k of keys) {
      const b = buckets[k] ?? { income: 0, expenses: 0, surplus: 0 };
      income += b.income;
      expenses += b.expenses; // negative
    }
    return {
      income: income / count,
      expenses: expenses / count,
      surplus: (income + expenses) / count
    };
  }

  // Windows: 3M, 6M, YTD, 1Y
  const last3Keys = $derived.by(() => allMonths.slice(-3));
  const last6Keys = $derived.by(() => allMonths.slice(-6));
  const last12Keys = $derived.by(() => allMonths.slice(-12));
  const ytdKeys = $derived.by(() => {
    const year = endExclusive.getUTCFullYear();
    const mm = endExclusive.getUTCMonth(); // current month start; we need months < mm in same year
    const prefix = `${year}-`;
    return allMonths.filter((k) => k.startsWith(prefix) && Number(k.slice(5, 7)) <= mm);
  });

  const avg3m = $derived.by(() => sumAndAvg(last3Keys));
  const avg6m = $derived.by(() => sumAndAvg(last6Keys));
  const avg1y = $derived.by(() => sumAndAvg(last12Keys));
  const avgYtd = $derived.by(() => sumAndAvg(ytdKeys));

  // Batch rebuilds to avoid thrashing on rapid events
  const rebuildQueue = createKeyedBatchQueue<string>(async () => {
    rebuildFromCache();
  });

  // Rebuild when accounts context changes (e.g., excluded toggles)
  $effect(() => {
    accountsContext.accounts;
    rebuildQueue.enqueue('rebuild');
  });

  // Initial load + realtime subscriptions
  $effect(() => {
    void (async () => {
      await loadInitialTransactions();
      rebuildFromCache();
    })();

    pbClient.collection('transactions').subscribe('*', (e) => {
      const rec = e.record as TransactionsResponse;
      if (e.action === 'delete') transactionsById.delete(rec.id);
      else transactionsById.set(rec.id, rec);
      rebuildQueue.enqueue('rebuild');
    });

    return () => {
      pbClient.collection('transactions').unsubscribe();
    };
  });
</script>

<Tabs.Root value="six-months">
  <nav class="flex items-center justify-between space-x-2">
    <SectionTitle title="Trailing cashflow" />

    <Tabs.List>
      <Tabs.Trigger value="three-months">3M</Tabs.Trigger>
      <Tabs.Trigger value="six-months">6M</Tabs.Trigger>
      <Tabs.Trigger value="year-to-date">YTD</Tabs.Trigger>
      <Tabs.Trigger value="one-year">1Y</Tabs.Trigger>
    </Tabs.List>
  </nav>

  <Tabs.Content value="three-months">
    <div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
      <KeyValue title="Income per month" value={avg3m.income} />
      <KeyValue title="Expenses per month" value={Math.abs(avg3m.expenses)} />
      <KeyValue title="Surplus per month" value={avg3m.surplus} />
    </div>
  </Tabs.Content>

  <Tabs.Content value="six-months">
    <div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
      <KeyValue title="Income per month" value={avg6m.income} />
      <KeyValue title="Expenses per month" value={Math.abs(avg6m.expenses)} />
      <KeyValue title="Surplus per month" value={avg6m.surplus} />
    </div>
  </Tabs.Content>

  <Tabs.Content value="year-to-date">
    <div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
      <KeyValue title="Income per month" value={avgYtd.income} />
      <KeyValue title="Expenses per month" value={Math.abs(avgYtd.expenses)} />
      <KeyValue title="Surplus per month" value={avgYtd.surplus} />
    </div>
  </Tabs.Content>

  <Tabs.Content value="one-year">
    <div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
      <KeyValue title="Income per month" value={avg1y.income} />
      <KeyValue title="Expenses per month" value={Math.abs(avg1y.expenses)} />
      <KeyValue title="Surplus per month" value={avg1y.surplus} />
    </div>
  </Tabs.Content>
</Tabs.Root>
