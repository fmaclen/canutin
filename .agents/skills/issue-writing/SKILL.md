---
name: issue-writing
description: Create high-level GitHub issues that describe the problem, not the solution
---

# Issue Writing

## Overview

Use this skill when creating or rewriting a GitHub issue. The goal is a clear,
high-level description of the problem so someone can understand what is broken,
missing, or confusing without being pushed toward a specific implementation.

## Core Rule

Write the issue around the problem and its impact. Do not prescribe the fix.

## What to Include

- **Problem statement** - what is broken, missing, or needs improvement
- **Impact** - why it matters to users, developers, or the product
- **Context** - the smallest amount of detail needed to understand the issue
- **Known evidence** - relevant error logs, failing behavior, or other concrete signals that help explain the problem
- **Expected outcome** - what should be true once the problem is resolved

## What to Avoid

- **Proposed solutions** - no implementation plans or design prescriptions; by the time the issue is picked up, they may already be stale
- **Code examples** - keep the issue focused on the problem, not the patch; code in issues gets stale quickly
- **Overly low-level detail** - include internals only when needed to explain the problem
- **Bundled issues** - split unrelated problems into separate issues

## Title Guidance

Keep the title short, concrete, and problem-focused.

- Good: `Balance recalculation misses reassigned transactions`
- Good: `Import preview shows stale account balances`
- Avoid: `Add retry logic to balance worker`
- Avoid: `Refactor the import preview component`

## Body Guidance

Use whatever concise format best fits the issue: a short paragraph, a few bullets, or both. Focus on:

1. What is happening now
2. Why that is a problem
3. Any known evidence or context that helps define the problem
4. What good looks like after the issue is resolved

## Example Shape

```md
## Summary

- Balance recalculation skips accounts when a transaction is reassigned
- Users see stale balances on the old account until a manual edit retriggers the worker
- We should make the worker track both the old and new account on update
```

## GitHub Workflow

When creating the issue, use `gh issue create` and apply this skill before writing the title or body.

Before creating the issue, fetch the current repository labels and apply the ones that are actually relevant to the problem.

- Use `gh label list` to inspect the available labels
- Apply only labels that clearly fit the issue
- Do not invent new labels unless the user explicitly asks

## See Also

- [code-quality.md](../code-quality/SKILL.md) - Shared writing and repo conventions
- [commits-and-prs](../commits-and-prs/SKILL.md) - PR guidance once the issue work is complete
