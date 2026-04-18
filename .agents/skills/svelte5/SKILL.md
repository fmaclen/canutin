---
name: svelte5
description: Svelte 5 runes, event handling, snippets, navigation - never use Svelte 4 patterns
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

Use properties, not directives:

| Svelte 5             | Svelte 4 (DO NOT USE) |
| -------------------- | --------------------- |
| `onclick={handler}`  | `on:click={handler}`  |
| `oninput={handler}`  | `on:input={handler}`  |
| `onsubmit={handler}` | `on:submit={handler}` |

For custom events, pass callback props instead of `createEventDispatcher`.

## Content Passing (Snippets)

Use snippets instead of slots:

| Svelte 5                         | Svelte 4 (DO NOT USE) |
| -------------------------------- | --------------------- |
| `{@render children?.()}`         | `<slot />`            |
| `{#snippet name()}...{/snippet}` | `<slot name="x">`     |

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

For dynamic URLs, disable the lint rule with explanation:

```typescript
// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL from sessionStorage
goto(storedUrl);
```

## Anti-patterns

- **Never use `$:`** - Use `$derived()` or `$effect()` instead
- **Never use `export let`** - Use `$props()` instead
- **Never use `on:event`** - Use `onevent` property instead
- **Never use `<slot>`** - Use snippets and `{@render}` instead
- **Never use stores for component state** - Runes handle all reactivity
- **Prefer reactive over imperative** - Use `$effect` and reactive dependencies over `setTimeout`/`setInterval`

## Reference

- shadcn components: `src/lib/components/ui/` (all use Svelte 5 patterns)
- Context stores: `src/lib/*.svelte.ts`
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)

## See Also

- [code-quality.md](../code-quality/SKILL.md) - TypeScript rules, formatting, sentence case
- [realtime.md](../realtime/SKILL.md) - PocketBase subscription patterns in context stores
