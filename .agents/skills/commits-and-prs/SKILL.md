---
name: commits-and-prs
description: 'How to commit, push, and open PRs in this repo'
---

# Commits and PRs

Use the `gh` CLI for all GitHub operations. The repo is private and the client is authenticated.

## Hard gate: approval is required before each git-history command

Before running `git add`, `git commit`, `git push`, `git reset`, `git revert`, `git rebase`, branch deletion, force-push, or any command that writes or rewrites git history, do this in order:

1. Find the user instruction that authorizes this exact command on this exact change set. It must come from the user, not from your own inference. Phrases like "do all the work", "looks good", or "make the changes" are not commit/push approval - they are scope approval.
2. Quote that instruction back in your reply before running the command, so the user can see what you are treating as approval.
3. If you cannot find an instruction that authorizes this exact action, stop and ask. Do not run the command.

Finishing the work, a passing test run, a green CI run, or a prior approval for an earlier change set is never approval for the next one.

Commit approval is scoped to one coherent change set. Push approval is separate from commit approval. Destructive operations require their own explicit ask, with the target named - if the target is ambiguous or could remove work the user may expect to keep, stop and ask one clarifying question stating what would be removed and what would remain.

After committing, tell the user the commit SHA, the scope it covered, whether anything remains uncommitted, and that future changes still need separate approval.

## Type prefix decides whether the change deploys

Semantic-release only cuts a release - and therefore a production deploy and tag - for `feat:` and `fix:`. A `chore:` PR merges but **does not deploy and does not get tagged**.

| Type     | Use for                                             | Deploys + tags? |
| -------- | --------------------------------------------------- | --------------- |
| `feat:`  | New user-visible behavior or capability             | Yes             |
| `fix:`   | Bug fix that corrects existing behavior             | Yes             |
| `chore:` | Internal-only changes: skills, dev docs, CI, config | No              |

If the change needs to reach production, it must be `feat:` or `fix:`. Reserve `chore:` for maintenance that genuinely should not deploy.

Do not use `refactor`, `docs`, `test`, `perf`, `style`, or other conventional-commit types unless the repo configuration changes to support them.

This applies to commit messages and PR titles equally; PRs are squash-merged and the PR title becomes the merge commit.

## Commit hygiene

- Never mention AI tools in commits.
- Never add `Co-Authored-By` lines.
- Never commit secrets. If one slipped in, stop and tell the user before pushing.

## PR title

Same `type: description` format as commits. Before writing, run `gh pr list --state merged --limit 5` and match the existing style.

## PR description

- Four to six high-level bullets describing what the PR is about.
- No section headings - no `## Summary`, no `## Verification`, no `## Testing`.
- No file-by-file change lists, flow diagrams, or test commands. Detailed reasoning belongs in inline PR comments on specific files, not in the description.
- If the PR was initiated from an issue, the last line of the body must be `Closes #<issue>` (or `Refs #<issue>` for partial work). Not in the title. Not at the top. Plain line, not a bullet.
- If there is no linked issue, ask the user before opening the PR. If the user confirms there is none, write `No linked issue (confirmed by user)` on the final line instead.

After creating the PR, verify the body with `gh pr view --json body` and fix with `gh pr edit` if anything is off.

## Monitoring CI after a push

Optional, but if you do monitor CI, use `gh run watch` - it blocks until the run finishes and exits with the run's status.

## New environment variables

If the PR introduces new env vars, the reviewer must add them manually to deployment targets before the preview or production environment will work. Call this out at the top of the PR body using a GitHub alert:

```markdown
> [!WARNING]
> This PR adds new environment variables. Add `FOO_API_KEY` and `BAR_SECRET` before merging.
```

## After merge

- Delete the remote branch: `git push origin --delete <branch-name>`.
- Keep the worktree alive for reuse unless the user asks to tear it down. Setting up worktrees is expensive; reusing them is cheap.
