---
name: code-review
description: Checklist for reviewing code changes - quality, logic, framework patterns, tests
---

# Code Review Conventions

## Overview

Guidance for reviewing code changes. **Be ruthless and nitpicky.** Every violation matters - flag it, even if it seems minor. Reference specific convention skills for detailed rules.

## What to Check

### Code Quality (Check Every New Function)

Review against [code-quality.md](../code-quality/SKILL.md). For **every** new or modified function/method:

- **No explicit return types** - TypeScript must infer them (exception: class getters only)
- **No `any` types** - Use `unknown` or proper types
- **No unused code** - Check for unused imports, variables, interfaces, types, functions, parameters
- **No unused parameters with defaults** - If no caller passes a value, inline it
- **No variable shadowing** - Parameter names must not shadow imports or outer scope variables

### Comments and Return Types (Commonly Overlooked)

- **Redundant comments** - Remove comments that explain self-explanatory code:
  - Bad: `// Loop through users` above `for (const user of users)`
  - Bad: `// Check if empty` above `if (items.length === 0)`
- **Useful comments** - Keep comments that explain the "why", not the "what":
  - Good: `// Process sequentially to avoid creating duplicate labels`
  - Good: `// Subscribe FIRST to avoid missing events during initial fetch`

### Error Handling

Review against [error-handling.md](../error-handling/SKILL.md):

- User actions show friendly toasts via `svelte-sonner`
- Subscriptions use `logError` (no toast - transient errors)
- Backend Go hooks use `log.Printf` with `[tag]` prefix
- No raw error messages shown to users
- No silently swallowed errors

### Logic and Correctness

- State properly initialized, updated, and reset (especially on logout/cleanup paths)
- Edge cases handled (empty states, errors, timeouts)
- No silent failures or unhandled promise rejections
- Cleanup on unmount/logout (timers, subscriptions, state flags)

### Performance

- **Query efficiency** - Avoid N+1 queries; batch where possible
- **Unnecessary re-fetches** - Don't fetch data already available in context/state
- **Expensive computations** - Memoize or debounce where appropriate
- **Large dataset handling** - Pagination, virtualization, or lazy loading for lists
- Use PocketBase Logs API to inspect query performance when in doubt (see [pocketbase.md](../pocketbase/SKILL.md))

### Framework Patterns

Review against [svelte5.md](../svelte5/SKILL.md), [realtime.md](../realtime/SKILL.md), and [pocketbase.md](../pocketbase/SKILL.md):

- Following "the Svelte way" / "the PocketBase way"
- Reusing existing patterns vs introducing new ones
- Check similar files for established conventions

### Test Coverage

Review against [testing.md](../testing/SKILL.md):

- Main feature of the PR has test coverage
- New logic paths have coverage
- Critical user flows tested E2E
- Selector priority followed: `getByText` > `getByLabel` > `getByRole` > `getByTestId`
- No explicit timeouts (`setTimeout`, `waitForTimeout`, timeout options)
- Blank lines after `expect` blocks before the next action
- Tests are flat (no `test.describe` blocks)
- Real person names for test emails; no role-based emails like `owner@example.com`

### UI Text

- Sentence case for all UI labels (e.g., "Add account" not "Add Account")
- No trailing periods in UI text
- No ellipsis for loading states

### Code Smells

- Imperative patterns where reactive alternatives exist
- Manual implementations where project dependencies handle it
- Magic numbers without context
- Inconsistent patterns with rest of codebase

## Process

1. Read relevant convention skills before reviewing
2. Check **every** new function against Code Quality rules above
3. Compare new code against similar existing code
4. Flag deviations from established patterns
5. Verify the main feature works and has tests

## See Also

- [code-quality.md](../code-quality/SKILL.md) - TypeScript, formatting, commits
- [svelte5.md](../svelte5/SKILL.md) - Svelte 5 patterns
- [realtime.md](../realtime/SKILL.md) - PocketBase subscription patterns
- [pocketbase.md](../pocketbase/SKILL.md) - Backend conventions
- [testing.md](../testing/SKILL.md) - E2E testing patterns
