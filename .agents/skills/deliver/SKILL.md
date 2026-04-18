---
name: deliver
description: PR creation, commit format, handoff to reviewer, CI trigger minimization
---

# Deliver

## Overview

Creating a PR and handing off to a human reviewer. Only enter this phase after local quality passes and any relevant Playwright tests have run green.

## When to Create a PR

Only after `bun run quality` passes and relevant E2E tests have been run locally. Be confident before triggering CI — every push to a PR branch runs the full CI pipeline (desktop + mobile Playwright).

## PR Creation

Use `gh pr create`.

### Base Branch

Base PRs on `next` for v2 features (per `AGENTS.md`).

### Title

Use the same conventional commit format as commit messages: `type: description` (see [code-quality.md](../code-quality/SKILL.md#commit-messages)). Before writing the title, run `gh pr list --state merged --limit 5` and match the existing style.

### Description

Before writing the description, run `gh pr list --state merged --limit 5 --json number,title,body` and match the tone and structure of existing PRs.

Keep it high-level — what changed and why, not implementation details. A `## Summary` section with a few bullet points or a short paragraph is enough. Do not include verbose technical breakdowns, file-by-file change lists, or flow diagrams unless the change is genuinely complex.

Detailed explanations of specific logic belong in inline PR comments on the relevant files, not in the description.

Include:

- `Closes #<issue>` to link the issue (or `Refs #<issue>` for partial work)
- Any new environment variables the reviewer needs to add

### Issue Reference (Hard Requirement)

Every PR MUST include a valid issue-closing reference (`Closes #123`, `Fixes #123`, or `Resolves #123`). For partial work use `Refs #123`.

- The issue number must be a real number, not a placeholder like `#{issue}`.
- If no issue number is known, **stop and ask the user**. Do not create a PR without an issue reference.
- If the user explicitly confirms there is no issue, include `No linked issue (confirmed by user)` in the PR body instead.
- After creating the PR, verify the PR body contains the issue reference by running `gh pr view --json body`. If missing, update immediately with `gh pr edit`.

## Inline Comments

If a file has non-obvious logic, add an inline PR comment explaining the reasoning. Assume the reviewer is scanning many PRs quickly and needs to get up to speed fast on specific files.

## New Environment Variables

If your changes introduce new env vars, call this out prominently in the PR description. The reviewer must add them manually to their local `.env` and any deployment targets.

## Minimize CI Triggers

Each push to a PR branch triggers CI. Push only when confident. If you need to iterate, push without creating a PR, verify locally, then push the final version and open the PR.

## Review Feedback

Respond to review comments. If the reviewer requests changes, go back to the implement → verify cycle before pushing again.

## After Merge

After a PR is merged, clean up:

1. Delete the remote branch: `git push origin --delete <branch-name>`
2. If a worktree was used: `bun run worktree:teardown <N> --prune`

Do not leave merged branches lingering on the remote.

## When Stuck

Explicitly tell the user what you're stuck on and what manual assistance you need.

## See Also

- [verify.md](../verify/SKILL.md) - Local verification workflow
- [code-quality.md](../code-quality/SKILL.md) - Commit message format
