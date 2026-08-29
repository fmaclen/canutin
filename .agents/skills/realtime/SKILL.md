---
name: realtime
description: PocketBase realtime subscriptions, debouncing, subscription lifecycle in context stores
---

# Realtime Conventions

## Overview

PocketBase realtime subscriptions drive live data updates. Context stores in `src/lib/*.svelte.ts`
subscribe to collection changes and refresh UI state accordingly. Every realtime store follows one
model: **realtime events and reconnects are pure invalidation signals** — each schedules a debounced,
latest-request-wins full refetch, and the fresh snapshot replaces the whole cache. Events are never
patched into local state.

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
`src/lib/realtime-sync.ts` holds the two canonical helpers (`RequestSequence`, `Debouncer`).

1. **Subscribe before the initial fetch.** Subscribe in the `init()` effect _before_ issuing the first
   refresh, so no event is missed during the fetch window. The initial fetch is guarded by `userId`.
2. **Event → debounced invalidate.** A realtime event calls `invalidate()`, which schedules the
   refetch through the shared `Debouncer` (200ms trailing). Bursts coalesce to one refetch.
3. **Reconnect → same invalidate.** Register one `registerRealtimeReconnect(() => this.invalidate())`
   callback per store so a restored connection triggers the identical corrective refetch. The
   registry decides _when_ that fires — see "Connection recovery" below.
4. **Latest-request-wins commit.** Take a `RequestSequence` token with `sequence.next()` before the
   await; on _every_ path that touches state — the success commit, `catch`, and `finally` — re-check
   both `sequence.isCurrent(token)` and `userId === auth.currentUserId` and bail if either fails. This
   is what makes an event arriving mid-fetch safe: the stale in-flight fetch is discarded and the
   follow-up refetch wins.
5. **Whole-cache replace, never event-payload patching.** A refresh replaces the entire cache from the
   fresh snapshot. Never upsert, merge, or read `e.record` into state. Deletes and cascades are handled
   for free — the removed rows are simply absent from the next snapshot.
6. **Complete dispose.** `dispose()` must: cancel the debounce, unregister _both_ the teardown and the
   reconnect callback, unsubscribe the specific collection topics (never `realtime.unsubscribe()`), and
   bump the sequence to supersede any in-flight refresh.
7. **`isLoading` lives only in `init()`.** Set it `true` when the effect starts loading for a user and
   `false` on the guarded commit; invalidations refetch silently.

### Auth is the sole exemption

`auth.svelte.ts` subscribes to a **single own-user record** and reacts only to `delete`
(→ session teardown). It holds no list, is self-correcting, and is the **teardown coordinator** every
other store registers into via `registerRealtimeTeardown`. It is not a data-sync store — do not force
it into the contract.

## Connection recovery

Reference: `src/lib/pocketbase.svelte.ts` (`registerRealtimeReconnect`, `recoverRealtime`).

**EventSource has no liveness detection.** A dropped network or a slept laptop routinely leaves the
socket in `readyState === OPEN` forever: no `error` event, no `onDisconnect`, no `PB_CONNECT`, and
therefore no reconnect from the SDK — which only reconnects on a transport error. The socket can even
keep delivering events while the network is down, and every refetch they schedule fails and is
discarded (stores have no retry). A session in that state stays stale indefinitely. The SDK's
reconnect path is real but covers only the cases where the transport actually errors.

So recovery has **three triggers**, all funneled through the registry:

1. `PB_CONNECT` after an `onDisconnect` with active subscriptions — the SDK's own path.
2. `window` `online` — the network came back.
3. `document` `visibilitychange` → visible — covers sleep/wake and long-backgrounded tabs, which
   `online` alone misses. A hidden tab is deliberately left alone; this trigger picks it up when the
   user returns.

Triggers 2 and 3 are browser-only, so they are registered behind `browser` from `$app/environment`.

Recovery is **latched, not fire-and-forget**. A refetch issued the instant a trigger fires can still
hit an unusable network (`online` precedes real connectivity), and a store's failed refetch vanishes.
So the registry probes `health.check()` on a bounded backoff and fires the registered callbacks only
once the backend actually answers; after the last delay it gives up and waits for the next trigger,
so an hour offline costs a handful of probes rather than a hot loop. A single `_recovering` flag
coalesces the burst — SDK reconnect, `online`, and `visibilitychange` usually arrive together — into
one round of invalidations.

Testing this: dispatching an `error` event on the EventSource only exercises trigger 1 — it injects
the very signal whose absence is the real-world failure. A genuine offline needs CDP
(`Network.emulateNetworkConditions`); Playwright's `context.setOffline()` tears the socket down and
so exercises trigger 1 as well. Both cases are covered in `e2e/shared-records.test.ts`.

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
- **Treating the SDK's reconnect as the whole recovery story** — it never fires when the socket stays
  OPEN, which is the common real-world drop; the browser triggers are part of the contract
- **`realtime.unsubscribe()`** — kills ALL subscriptions; unsubscribe the specific collection topics
- **No debouncing** — causes UI flicker and excessive API calls during bulk operations

## See Also

- [pocketbase.md](../pocketbase/SKILL.md) - Backend, Go hooks, API
- [svelte5.md](../svelte5/SKILL.md) - Runes and reactivity
- PocketBase JS SDK docs: Realtime subscriptions
