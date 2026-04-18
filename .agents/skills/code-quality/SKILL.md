---
name: code-quality
description: TypeScript strict mode, Prettier, conventional commits, code style, git workflow
---

# Code Quality Conventions

## Overview

TypeScript strict mode, Prettier formatting, and conventional commits.

## Commands

```bash
bun run quality   # Format + lint + type check (run before committing)
bun run lint      # ESLint only
bun run check     # svelte-check only
```

## TypeScript

### Rules

- **Never use `any`** - Use `unknown` or proper types
- **Never use explicit return types** - Let TypeScript infer (exception: class getters with complex inline types)
- **Never use `@ts-ignore`** - Fix the underlying issue
- **Never disable linter rules** - Fix the code instead
  - Exception: `svelte/no-navigation-without-resolve` for dynamic URLs (see [svelte5.md](../svelte5/SKILL.md#navigation))
- **Avoid default parameter values** - Only use when strictly necessary; prefer explicit arguments at call sites

### Type Narrowing

Prefer type guards over type assertions:

```typescript
// Good: type guard
if (isUser(data)) { ... }

// Avoid: type assertion
const user = data as User;
```

## Formatting

- **Prettier** with 100 char line width
- **Tabs** for indentation
- Config: `.prettierrc`

## Import Organization

Sort order (handled by Prettier):

1. Built-in modules
2. Third-party modules
3. `$env/*` aliases
4. `$app/*` aliases
5. `$lib/*` aliases
6. Relative imports

## Commit Messages

Format: `type: description`

| Type       | Usage                        |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `refactor` | Code change (no feature/fix) |
| `docs`     | Documentation only           |
| `test`     | Adding/updating tests        |
| `chore`    | Maintenance tasks            |

Examples:

- `feat: add account sharing`
- `fix: resolve balance calculation race condition`
- `refactor: extract transaction dedup logic`

## Code Style

- **Keep code self-documenting** - Prefer clear names and structure over narration
- **No unnecessary comments** - Only comment complex business logic or non-obvious algorithms
- **Use line-comment prefixes for intentional comments** - `// NOTE:`, `// HACK:`, `// TODO:`, or `// FIXME:` for durable comments
  - `NOTE:` for important context, rules, or constraints that are easy to miss
  - `HACK:` for deliberate workarounds or temporary compromises
  - `TODO:` for planned follow-up work that is still intentionally deferred
  - `FIXME:` for known broken or risky behavior
- **Remove or update stale comments** - If the code changes, keep the comment accurate or delete it
- **Extract when used 2-3+ times** - Avoid premature abstraction
- **Inline single-use logic** - Don't extract functions used only once
- **Remove unused code** - Delete dead imports, variables, functions
- **Sentence case for UI labels** - Except acronyms/proper names
- **No trailing periods in UI text** - Labels, buttons, headings
- **No ellipsis in UI text** - Never use `...` or `…` for loading. Use a spinner or `toast.loading()` instead
- **Use project dependencies** - Don't manually implement what libraries provide (e.g., `date-fns` for time math)

## Dependencies

- All packages go in `devDependencies` (SvelteKit bundles everything at build time)
- Use `bun add -d` (not `bun add`) when adding packages
- Use `bun install` (not npm)

## Git Workflow

- **Never commit without explicit user approval** - Each commit triggers CI
- **Show changes first** - Let the user review before committing
- **Use `gh` CLI for GitHub operations** - Repo is private, client is authenticated

## Anti-patterns

- **Never mention AI tools in commits** - No references to Claude, GPT, etc.
- **Never add co-author tags** - No `Co-Authored-By`
- **Never commit secrets** - Use environment variables

## See Also

- [issue-writing.md](../issue-writing/SKILL.md) - GitHub issue authoring guidance
- [testing.md](../testing/SKILL.md) - Test conventions
- [svelte5.md](../svelte5/SKILL.md) - Svelte 5 patterns
