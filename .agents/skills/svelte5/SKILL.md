---
name: svelte5
description: 'Frontend writing conventions in this Svelte 5 codebase'
---

# Svelte 5 Conventions

## Overview

This project uses Svelte 5 with runes. Never use Svelte 4 patterns.

## Runes (State Management)

| Rune         | Purpose           | Replaces            |
| ------------ | ----------------- | ------------------- |
| `$state()`   | Reactive variable | `let x = 0`         |
| `$derived()` | Computed value    | `$: x = y * 2`      |
| `$effect()`  | Side effects      | `onMount`, `$: { }` |
| `$props()`   | Component props   | `export let`        |

## Event Handling

Event handlers are properties:

- `onclick={handler}`
- `oninput={handler}`
- `onsubmit={handler}`

For custom events, pass callback props.

## Content Passing (Snippets)

Render passed-in content with snippets:

- `{@render children?.()}` for default content
- `{#snippet name()}...{/snippet}` for named blocks

Access default content via `children` prop:

```svelte
let {children} = $props();
{@render children?.()}
```

## Navigation

Always use `resolve()` with `goto()` for static paths:

```typescript
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

goto(resolve('/accounts')); // Correct
goto('/accounts'); // Wrong - won't work with base paths
```

For dynamic URLs (e.g., from sessionStorage), `resolve()` can't be used. Disable the lint rule with explanation:

```typescript
// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL from sessionStorage
goto(storedUrl);
```

## Reactivity style

- Use runes for all component state - `$state`, `$derived`, `$effect`, `$props`.
- Prefer reactive dependencies (`$effect`, `$derived`) over imperative `setTimeout` / `setInterval`.

## Reference

- UI components: `src/lib/components/`
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
