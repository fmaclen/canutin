---
name: realtime
description: PocketBase realtime subscriptions, debouncing, subscription lifecycle in context stores
---

# Realtime Conventions

## Overview

PocketBase realtime subscriptions drive live data updates. Context stores in `src/lib/*.svelte.ts`
subscribe to collection changes and refresh UI state accordingly. Every realtime store follows one
model: **realtime events and reconnects are pure invalidation signals** — each marks the store stale
and schedules a debounced, latest-request-wins full refetch, and the fresh snapshot replaces the
whole cache. Events are never patched into local state.

Staleness is **durable**: a store that missed an update stays marked stale until a refetch actually
commits. A refetch that fails is never discarded — it keeps the flag and retries on a backoff. No
signal carries correctness on its own; signals only mark stores stale and poke their retries.

## Store sync contract

### Sync vs projection

Each store has two layers, and only the first is governed by this contract:

- **Sync layer** — how server truth reaches the store's in-memory cache. Subscriptions, reconnects,
  fetches, and cache commits live here. This is what "invalidation-only" governs: the sync layer never
  reads an event payload into state; it only discards its cache and refetches. (Inspecting the payload
  to decide relevance is fine — account-cashflow filters transaction events to its mounted account —
  but never to patch state.)
- **Projection layer** — `$derived` work over the cache: perspective/currency conversion, aggregation,
  sorting, filtering, pagination slicing. Fully reactive, incremental, network-free, and **out of the
  contract's scope**.

Confusing the two is the main way to misread this. Canonical example: cashflow's `accounts`-driven
effect (`cashflow.svelte.ts`) recomputes averages from the _already-cached_ transaction map when
balances or perspective change — no network. That is projection and MUST stay incremental; converting
it to a refetch reintroduces the regression that gated it. Only cashflow's transaction-event path is
sync, and only it invalidates.

### The seven obligations

Every realtime store must satisfy all seven. `src/lib/securities.svelte.ts` is the reference shape;
`src/lib/realtime-sync.ts` holds the one canonical helper, `StaleSync`.

1. **Subscribe before the initial fetch.** Subscribe in the `init()` effect _before_ issuing the first
   refresh, so no event is missed during the fetch window. The initial fetch is guarded by `userId`.
2. **Event → `sync.invalidate()`.** A realtime event marks the store stale and schedules the refetch
   on the shared 200ms trailing debounce. Bursts coalesce to one refetch.
3. **One `StaleSync` per independently-stale collection, registered with the registry.** Construct it
   with `new StaleSync(pb, context, operation, (token) => this.refreshAll(token))` and register it via
   `pb.registerRealtimeSync(sync)`, so a dropped socket marks it stale and a restored one retries it.
   Most stores need exactly one; add a second only when two collections go stale independently
   (`transactions.svelte.ts` keeps its label dictionary separate, because a transaction mutation can
   never change labels).
4. **Latest-request-wins commit.** The refresh function receives the run's token; on _every_ path that
   touches state — the success commit and any `finally` — re-check both `sync.isCurrent(token)` and
   `userId === auth.currentUserId` and bail if either fails. This is what makes an event arriving
   mid-fetch safe: the stale in-flight fetch is discarded and the follow-up refetch wins.
   **The refresh must throw on failure** — never swallow the error. `StaleSync` catches it, routes it
   through `pb.handleConnectionError`, keeps the store stale and retries. A superseded run is dropped
   without re-marking, because the newer run owns the outcome.
5. **Whole-cache replace, never event-payload patching.** A refresh replaces the entire cache from the
   fresh snapshot. Never upsert, merge, or read `e.record` into state. Deletes and cascades are handled
   for free — the removed rows are simply absent from the next snapshot.
6. **Complete dispose.** `dispose()` must: call `sync.cancel()` (cancels the pending run, supersedes
   any in-flight refresh, clears the flag), unregister _both_ the teardown callback and the sync, and
   unsubscribe the specific collection topics (never `realtime.unsubscribe()`).
7. **`isLoading` lives only in `init()`.** Set it `true` when the effect starts loading for a user and
   `false` on the guarded commit; invalidations refetch silently.

A user's own write, or an initial load, calls `sync.refreshNow()`: it skips the debounce, and a
successful run clears the stale flag just like a scheduled one.

### Auth is the sole exemption

`auth.svelte.ts` subscribes to a **single own-user record** and reacts only to `delete`
(→ session teardown). It holds no list, is self-correcting, and is the **teardown coordinator** every
other store registers into via `registerRealtimeTeardown`. It is not a data-sync store — do not force
it into the contract.

## Connection recovery

Reference: `src/lib/pocketbase.svelte.ts` (`registerRealtimeSync`, `probeBackend`).

**EventSource has no liveness detection.** A dropped network or a slept laptop routinely leaves the
socket in `readyState === OPEN` forever: no `error` event, no `onDisconnect`, no `PB_CONNECT`, and
therefore no reconnect from the SDK — which only reconnects on a transport error. The socket can even
keep delivering events while the network is down, and every refetch they schedule fails. The SDK's
reconnect path is real but covers only the cases where the transport actually errors.

That is why staleness is durable rather than trigger-driven: a failed refetch keeps the store marked
stale and retries on its own backoff (first at ~1s, doubling, capped at 30s, paused while the tab is
hidden). The registry's triggers only make convergence _faster_; none of them is load-bearing for
correctness.

- **`onDisconnect` with active subscriptions → mark every registered store stale.** The moment the
  socket drops, everything is possibly stale, and the flag survives until a refetch commits.
- **`PB_CONNECT` → retry the stale stores.** The most precise "backend is reachable again" signal
  there is. A store that is not stale ignores it, so the initial connect costs nothing.
- **`window` `online` → retry the stale stores**, and reset their backoff — the network just changed.
- **`document` `visibilitychange` → visible → same.** Covers sleep/wake and long-backgrounded tabs,
  which `online` alone misses; retries are paused while hidden and picked back up here.

The last two are browser-only, so they are registered behind `browser` from `$app/environment`.

An `online` event precedes real connectivity, so a retry round asks `pb.probeBackend()` first: one
small `health.check` answers for every store, so a tick while the backend is down costs one request
instead of a doomed refetch per store. It is a **gate the retry awaits, not a latch** — marking a
store stale is idempotent, so triggers arriving mid-round coalesce for free and none can be dropped.

Testing this: dispatching an `error` event on the EventSource only exercises the SDK's own path — it
injects the very signal whose absence is the real-world failure. A genuine offline needs CDP
(`Network.emulateNetworkConditions`); Playwright's `context.setOffline()` tears the socket down and
so exercises the SDK path as well. Both cases are covered in `e2e/shared-records.test.ts`.

## Server-side debouncing (Go hooks)

Balance calculations are debounced server-side to batch rapid transaction mutations, so a bulk import
of N transactions across A accounts produces ~A balance writes, not N:

Reference: `pocketbase/main.go`, `pocketbase/balance.go`

- 250ms trailing-edge debounce per account
- Worker checks the pending queue every 50ms
- Prevents N balance records for N transactions in a bulk import

This is what keeps the client's per-store debounced refetch cheap: a burst settles into a handful of
refetches, not one per row.

## Anti-patterns

- **Patching state from an event payload** — reintroduces snapshot-clobber and delete-resurrection; the
  whole-cache replace exists to make those impossible, not merely guarded
- **Forgetting `requestKey: null`** on a `getFullList`/`getList` that may run during a bulk operation —
  the SDK auto-cancels the in-flight request and data disappears mid-operation
- **Converting a `$derived` projection into a refetch** — projection is network-free by design; see
  the sync/projection split above
- **Dropping a mid-flight event as "already fetching"** — obligations 2 and 4 together require a
  follow-up refetch so the newer server state wins
- **Swallowing a refresh failure** — a discarded refetch is exactly how a store goes quietly stale
  forever; let it throw so the sync keeps the flag and retries
- **Treating a signal as correctness** — the SDK's reconnect never fires when the socket stays OPEN,
  and `online` fires before the network works. Signals only mark and poke; the durable flag decides
- **`realtime.unsubscribe()`** — kills ALL subscriptions; unsubscribe the specific collection topics
- **No debouncing** — causes UI flicker and excessive API calls during bulk operations

## See Also

- [pocketbase.md](../pocketbase/SKILL.md) - Backend, Go hooks, API
- [svelte5.md](../svelte5/SKILL.md) - Runes and reactivity
- PocketBase JS SDK docs: Realtime subscriptions
