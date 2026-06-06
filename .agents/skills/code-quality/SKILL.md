---
name: code-quality
description: "Code rules the linter doesn't catch: types, comments, structure, UI text"
---

# Code Quality

## Skill rules outrank neighbors

This skill - and every convention skill in your bundle - takes precedence over patterns in existing code. Legacy violations are not permission to add new ones; they are signal that the area is owed a cleanup pass. Do not infer conventions by skimming nearby files. Read the skill, then write.

When a touched file already contains an instance of the rule you are now applying, delete that instance in the same diff. Same logic as the "delete dead code adjacent to what you're touching" rule below, applied to convention drift instead of dead code. Compatibility shims and `// keep for now` exemptions require a documented reason the user has agreed to.

## Types

- No `any` - use `unknown` or a proper type
- No explicit return types - let TypeScript infer. Exceptions: class getters and places where a framework requires an explicit signature
- No `@ts-ignore` - fix the underlying issue
- No disabling lint rules - fix the code instead. Exception: `svelte/no-navigation-without-resolve` for dynamic URLs (see [svelte5](../svelte5/SKILL.md#navigation))
- Prefer type guards (functions returning `x is T`) over `as` assertions - `as` silences the compiler without proving anything

## Comments

- Self-documenting code first - clear names and structure beat narration
- Only durable comments - non-obvious rules, constraints, workarounds, tradeoffs
- Prefix intentional comments so cleanup passes can tell them from disposable narration:
- `NOTE:` important context, rules, or constraints that are easy to miss
- `HACK:` deliberate workarounds or temporary compromises
- `TODO:` planned follow-up work that is intentionally deferred
- `FIXME:` known broken or risky behavior that still needs correction
- For multiline intentional comments, prefix only the first line; continuation lines use plain `//`
- Keep pragma/framework comments in their required syntax when tooling depends on them
- Update or delete stale comments when the code changes

## Structure

- Every named function or variable is indirection - a jump the reader must make or a name they must hold in memory. Pay that cost only when it removes real duplication, or, for variables, when the name conveys information the expression does not
- Extract a function only when the same logic already appears in 3+ places, or in 2 places where the duplication is multi-line or carries subtle conditions that are easy to get wrong if copied
- A function called from exactly one place is never the right answer - inline it. The alternative is a longer top-to-bottom procedural function, and that's fine
- Anticipated future duplication does not count - wait for the duplication to exist
- YAGNI - never add functionality, parameters, exports, or configuration for a speculative future use case. Wait for the use case to exist
- Never leave old code behind for backwards compatibility - delete what's being replaced. Compatibility shims, deprecated wrappers, and "just in case" code paths are speculation about the past in the same way YAGNI is speculation about the future. If a real caller breaks, that's a signal, not a regression
- Avoid wrapper layers - re-exports, aliases, thin adapter modules, delegation. Callers should reference the receiver directly
- Prefer a larger refactor that simplifies several things at once over a surgical change threaded through complexity that should be removed. Before starting, zoom out and consider whether the change should be bigger
- Name an intermediate value only when the name conveys information the expression does not; a `const` assigned and consumed on the following line is noise
- Don't abbreviate names unless the abbreviation is broadly known
- No default parameter values - function arguments should be required. Only add a fallback (`= value`) when there is a clear, justified reason
- Always delete dead code and useless comments adjacent to what you're touching, even when they fall outside the current change - unused imports, variables, functions, unreachable paths, stale narration. Deletions are cheap to review and easy to revert, and unchecked rot compounds

## UI Text

- Sentence case (except acronyms and proper names)
- No trailing periods in single-sentence UI text - labels, buttons, headings, tooltips, descriptions, toasts
- No ellipsis (`...` or `…`) to indicate loading or progress - use a spinner component or `toast.loading()`. Write "Creating account", not "Creating account..."

## Libraries

- Use project dependencies - don't reimplement what they provide
- Use `date-fns` for date/time math: comparisons, ranges, calendar boundaries
- Avoid manual millisecond arithmetic for calendar boundaries - it breaks on timezone, DST, and month-boundary edges

## Dependencies

- All packages go in `devDependencies` - this project has no `dependencies` section
- Use `bun add -d` to add, `bun install` to install - never npm
