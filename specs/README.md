# Specifications

Design documentation for CanutinX (SvelteKit + PocketBase).

## How to Use

1. **Start here** - This index lists all specs by category
2. **Load on demand** - Only read specs relevant to your current task
3. **Specs = WHAT** - Design intent and patterns, not implementation details
4. **Code = truth** - When in doubt, check the actual source files referenced

## Conventions

| Spec                                                         | Purpose                              |
| ------------------------------------------------------------ | ------------------------------------ |
| [conventions/svelte5.md](./conventions/svelte5.md)           | Svelte 5 runes, events, snippets     |
| [conventions/testing.md](./conventions/testing.md)           | Playwright E2E testing patterns      |
| [conventions/code-quality.md](./conventions/code-quality.md) | TypeScript, formatting, commits      |
| [conventions/code-review.md](./conventions/code-review.md)   | Code review checklist                |
| [conventions/realtime.md](./conventions/realtime.md)         | PocketBase subscriptions, debouncing |

## Spec Template

When creating new specs, follow this structure:

```markdown
# [Topic]

## Overview

1-2 sentences on what this covers.

## Patterns

- Key pattern with reference to actual code

## Anti-patterns

- What to avoid and why

## See Also

- Links to related specs or external docs
```

**Guidelines:**

- Keep specs short (50-80 lines max)
- Reference real file paths for stable components
- No code examples that can become stale
- Update specs when patterns change
