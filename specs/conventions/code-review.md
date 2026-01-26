# Code Review Conventions

## Overview

Guidance for reviewing code changes. **Be ruthless and nitpicky.** Every violation matters - flag it, even if it seems minor.

## What to Check

### Code Quality (Check Every New Function)

Review against [code-quality.md](./code-quality.md). For **every** new or modified function/method:

- **No explicit return types** - TypeScript must infer them (exception: class getters only)
- **No `any` types** - Use `unknown` or proper types
- **No unused code** - Check for unused imports, variables, interfaces, types, functions, parameters
- **No variable shadowing** - Parameter names must not shadow imports or outer scope variables

### Comments and Return Types (Commonly Overlooked)

- **Redundant comments** - Remove comments that explain self-explanatory code:
  - Bad: `// Loop through users` above `for (const user of users)`
  - Bad: `// Check if empty` above `if (items.length === 0)`
- **Useful comments** - Keep comments that explain the "why", not the "what":
  - Good: `// Process sequentially to avoid creating duplicate labels`
  - Good: `// Subscribe FIRST to avoid missing events during initial fetch`

### Logic and Correctness

- State properly initialized, updated, and reset (especially on logout/cleanup paths)
- Edge cases handled (empty states, errors, timeouts)
- No silent failures or unhandled promise rejections
- Cleanup on unmount/logout (timers, subscriptions, state flags)

### Framework Patterns

Review against [svelte5.md](./svelte5.md) and [realtime.md](./realtime.md):

- Following "the Svelte way" / "the PocketBase way"
- Reusing existing patterns vs introducing new ones
- Check similar files for established conventions

### Test Coverage

Review against [testing.md](./testing.md):

- Main feature of the PR has test coverage
- New logic paths have coverage
- Critical user flows tested E2E

### Code Smells

- Imperative patterns where reactive alternatives exist
- Manual implementations where project dependencies handle it
- Magic numbers without context
- Inconsistent patterns with rest of codebase

## Process

1. Read relevant convention specs before reviewing
2. Check **every** new function against Code Quality rules above
3. Compare new code against similar existing code
4. Flag deviations from established patterns
5. Verify the main feature works and has tests

## See Also

- [code-quality.md](./code-quality.md) - TypeScript, formatting, commits
- [svelte5.md](./svelte5.md) - Svelte 5 patterns
- [realtime.md](./realtime.md) - PocketBase patterns
- [testing.md](./testing.md) - E2E testing patterns
