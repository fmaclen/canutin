---
name: failures-and-logs
description: 'How failures throw, log, trace, and surface to users across the stack'
---

# Failures and logs

Treat every uncaught exception as a bug we own. Treat every silenced failure as a bug we have hidden from ourselves.

## Three kinds of signal

Backend and frontend code emit distinct signals. Conflating them is the most common mistake here, so pick one deliberately every time.

- **Monitored exceptions** - thrown errors. Use these for failures we own and want to fix.
- **Operational logs** - tagged `console.error` / `console.warn` on the frontend and `log.Printf` in PocketBase Go hooks. Transient developer/ops diagnostics.
- **Durable product traces** - persisted domain records such as transactions, balances, imports, and shares. These describe user-visible state and must survive process restarts.

## Throw or return: who owns the failure

When a failure happens, decide who owns the fix:

- We own it -> **throw**. Missing config, broken invariants, impossible states, backend hook failures, provider/auth failures, or internal data corruption.
- The world owns it -> **return a structured outcome** the caller can adapt to. No records found, validation rejected user input, a user lacks access, or an import row is malformed.

Classify at the boundary that has the context to decide - usually the data access, import, auth, or backend hook code that already knows the operation and failure mode.

Global classifiers that scan arbitrary error messages or guess from generic fields rot quickly and create false positives. Mark failures explicitly at the boundary instead.

## Frontend

User-visible failures go through `svelte-sonner` toasts:

- Short failures -> `toast.error('Friendly message')`.
- Long-running actions -> `toast.loading(...)` (the spinner communicates progress; ellipsis text is redundant), then dismiss on success or replace with `toast.error()` on failure.
- Auth forms -> inline error rendering reads better than a toast.

Keep the user-facing message generic and friendly. Let unexpected failures throw when there is no specific recovery path.

If a catch has a specific recovery path and would otherwise swallow the failure, log the raw error with a stable tag:

```typescript
console.error('[accountsStore] Failed to fetch accounts:', error);
```

## PocketBase hooks

Go hooks should return errors from request paths instead of panicking. Log operational diagnostics with stable bracket tags:

```go
log.Printf("[balanceWorker] failed to compute balance for account %s: %v", accountId, err)
```

PocketBase surfaces logs through the Logs API, so consistent tags make filtering possible.

## Defensive code is a smell

Prefer failures that happen fast and obviously over code that quietly papers over unexpected states. Defensive scaffolding hides bugs and trains readers to distrust the types.

- Reach for `?.` only when `undefined` or `null` is genuinely part of the value's type. If the type says the value is present, fix the type or let the access throw.
- Use `try` / `catch` only with a specific recovery path for a specific failure. Otherwise let the error propagate.
- Add guard clauses only when a real downstream path depends on them. A "just in case" guard hides a bug.

When one of these is genuinely necessary, leave a `NOTE:` comment explaining the underlying invariant.

## Log tag conventions

Tags are camelCase and usually match the surrounding function or module: `tokenRefresh`, `balanceWorker`, `importRevert`. Structured details must be redacted of secrets and sensitive account data.
