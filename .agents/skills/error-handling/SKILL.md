---
name: error-handling
description: Standardized error handling - frontend logging, toast patterns, Go hook logging
---

# Error Handling

## Overview

Standardized error handling with console logging on the client, user-friendly toasts, and tagged logs in the PocketBase Go hooks.

## Frontend

Use `svelte-sonner` `toast.error()` when user-facing feedback is needed. Log with a tag prefix for traceability:

```typescript
console.error(`[accountsStore] Failed to fetch:`, error);
```

If a centralized `logError` helper is added under `src/lib/errors.ts`, prefer it over raw `console.error`.

## Backend (Go hooks)

Use `log.Printf` with a `[tag]` prefix in `pocketbase/main.go` and related files:

```go
log.Printf("[balanceWorker] failed to compute balance for account %s: %v", accountId, err)
```

PocketBase also surfaces logs via the Logs API, so consistent tagging makes filtering easy.

## Patterns

- **User actions that fail** — show `toast.error('Friendly message')` and log the raw error with a tag
- **Long-running user actions** — show `toast.loading('Doing something')` (displays a spinner). Dismiss with `toast.dismiss(toastId)` on success, or replace with `toast.error()` on failure. Never use ellipsis text — the spinner communicates progress
- **Auth forms** — inline error display tends to give better UX for login failures
- **Realtime subscriptions** — log silently; do not toast on every transient reconnect
- **Backend Go hooks** — `log.Printf` with `[tag]` prefix, never panic in a request path

## Tag Naming

- camelCase: `balanceWorker`, `shareSync`, `importRevert`
- Match function/hook/store name when applicable

## Anti-patterns

- **Never show raw error messages** — always use friendly messages
- **Never swallow errors silently** — at minimum, log them
- **Never use inline error state** — use toasts (exception: auth forms)
- **Never panic in a Go hook handler** — return an error so PocketBase surfaces it properly

## See Also

- [svelte5.md](../svelte5/SKILL.md) - Component patterns
- [pocketbase.md](../pocketbase/SKILL.md) - Backend patterns and Logs API
- [realtime.md](../realtime/SKILL.md) - Subscription error handling
