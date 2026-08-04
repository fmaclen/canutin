---
name: code-review
description: 'How to review code before declaring a milestone done'
---

# Code Review

Review code before a milestone is called done. Findings are the product. Be specific, local, and willing to flag small violations.

## Output

Structured return, in this order:

1. **Skills loaded.** List every convention skill you opened for this review (see the Conventions section for the path-driven rules). A review that skipped a relevant skill is a failed review.
2. **Per-skill status.** For each loaded skill, one line: `<skill>: clean` if nothing to report, or `<skill>: <N> findings` and the findings listed below. A skill with zero findings must still appear - silence is not the same as clean.
3. **Findings**, ordered by severity. Each finding includes `path:line`, the violated rule (named to the skill it came from), and the concrete fix direction.
4. **Residual risks and testing gaps.** Things the review could not verify, areas not covered by the diff that adjacent behavior would benefit from, and strategic opportunities (see below).

Do not rewrite the diff unless implementation was explicitly requested.

## Correctness

- Behavior matches the user request and does not add unrequested behavior.
- State is initialized, updated, reset, and cleaned up on relevant lifecycle paths.
- Edge cases are handled where the changed behavior requires them.
- Failures are surfaced through the project failures-and-logs pattern.
- No silent failures, swallowed promises, or user-visible raw error messages.
- A change that alters behavior documented in a skill (`.agents/skills/`) or the served skill reference updates those docs in the same change set - flag it if the docs went stale (see the `pocketbase/skill.go` rule in [pocketbase](../pocketbase/SKILL.md)).

## Conventions

Review against every convention skill that applies to the diff. Combine every rule that matches:

- Always read `code-quality` - types, comments, structure, UI text, dependencies.
- Read `testing` whenever the diff touches any path under `e2e/` - correct test tier, stable assertions, no explicit timeouts, no over-specific implementation checks.
- Read `svelte5` whenever the diff touches any `.svelte` or `.svelte.ts` file - Svelte 5 syntax and component patterns.
- Read `pocketbase` whenever the diff touches PocketBase collections, generated schema, hooks, migrations, imports, or `pocketbase/`.
- Read `failures-and-logs` whenever the diff touches error surfaces - logging level, tags, user-safe messages.

A finding missed because the relevant convention skill was not in context counts as a review failure. If a diff spans multiple areas, load all of them before producing findings.

For every new or modified function, check type usage, return-type inference, unused code, defaults, indirection, and naming against `code-quality`.

## Pattern of violations

When a finding's violation also appears in nearby unchanged code, the writer probably matched a bad legacy pattern rather than read the rule. Flag this explicitly: the finding header should say `Pattern of violations: <rule>` and list every instance you found in the touched files, not just the line in the diff. Recommend deleting the legacy instances in the same change - same logic as `code-quality`'s "delete dead code adjacent to what you're touching" rule, applied to convention drift.

This converts the second-most-common review escape ("the writer copied the surrounding style") into a self-correcting signal. If you skip this and only flag the one new line, the next chunk of work in the same area will reproduce the same drift.

## Simplification

Treat avoidable added surface area as a review finding, even when tests pass. The review should catch cases where the diff could delete, inline, collapse, or narrow instead of adding code.

Flag local, concrete cases:

- One-use helpers, constants, intermediate values, wrappers, or aliases.
- Redundant assertions after observable behavior is already covered.
- New branches, guards, configuration, state, or helpers not required by the behavior under test.
- Dead code, stale comments, unused imports, or useless wrappers adjacent to touched code.
- Broad changes where a smaller deletion or inlining solves the same problem.

Put broad or additive cleanup ideas in residual risks/follow-up instead of findings.

## Strategic Opportunities

Note when the diff appears to patch around a larger design seam. These are not blocking findings unless the local diff is wrong.

Look for:

- Duplicated policy or state transitions.
- Scattered ownership of one product behavior.
- Repeated defensive guards around an unclear invariant.
- Tests that are hard because the design boundary is wrong.
- Code where the small fix works but leaves the next similar bug likely.

Return these as `Strategic opportunities`, not findings. Include the smallest next investigation that would validate the opportunity.

## Tests

- The main behavior has coverage at the right tier.
- New tests fail for the original bug or behavior gap when that is practical.
- Assertions prove observable behavior without over-specifying implementation details.
- Existing coverage is simplified when the diff makes old assertions redundant.

## Process

1. Resolve which convention skills apply (see Conventions) and read each one before reviewing.
2. Compare the diff against nearby established patterns.
3. Walk correctness, each loaded convention skill, simplification, tests, and strategic opportunities.
4. Produce the structured return defined in Output.
