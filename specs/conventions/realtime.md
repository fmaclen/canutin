# Realtime Conventions

## Overview

PocketBase realtime subscriptions for live data updates. Contexts subscribe to collection changes and update UI state accordingly.

## Patterns

### Client-Side Debouncing

When handling realtime events that trigger expensive operations (API calls, recomputation), debounce to batch rapid-fire events:

Reference: `src/lib/cashflow.svelte.ts`

- Store debounce timer as private class property
- Clear existing timer on each event
- Set new timer with 200ms delay
- Clean up timer in `dispose()`

### Disable Auto-Cancellation

PocketBase SDK auto-cancels in-flight requests when a new request with the same key is made. During bulk operations, this causes data to disappear temporarily.

Reference: `src/lib/cashflow.svelte.ts`

- Use `requestKey: null` in `getFullList()` options
- Only needed for queries that may run during bulk operations

### Server-Side Debouncing (Go Hooks)

Balance calculations are debounced server-side to batch rapid transaction mutations:

Reference: `pocketbase/main.go`

- 250ms trailing-edge debounce per account
- Worker checks pending queue every 50ms
- Prevents N balance records for N transactions in bulk import

## Subscription Lifecycle

1. Subscribe in `init()` before initial data fetch
2. Handle events with debounced callback
3. Unsubscribe in `dispose()`

## Anti-patterns

- **No debouncing** - Causes UI flicker and excessive API calls during bulk operations
- **Forgetting `requestKey: null`** - Causes data to disappear mid-operation
- **Unsubscribing all** - `realtime.unsubscribe()` kills ALL subscriptions; use collection-specific unsubscribe

## See Also

- [demo-mode.md](../demo-mode.md) - Demo seeding triggers many realtime events
- PocketBase JS SDK docs: Realtime subscriptions
