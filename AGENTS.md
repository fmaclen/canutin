# AGENTS.md

SvelteKit + PocketBase personal finance application using Bun.

## Quick Start

- **Package manager:** Bun (`bun install`, `bun run`, `bunx`)
- **Quality check:** `bun run quality` (run before committing)
- **Dev servers:** Always running — don't start them
- **Go 1.21+:** Required to build the PocketBase binary (first `bun run pb` compiles it)

## Skills

Load skills from `.agents/skills/<skill>/SKILL.md` based on the task.

Preferred intent aliases exist for discoverability:

| Alias           | Canonical     |
| --------------- | ------------- |
| `tests`         | `testing`     |
| `review`        | `code-review` |
| `pr`            | `deliver`     |
| `worktree`      | `setup`       |
| `orchestrate`   | `pm`          |
| `working-notes` | `scratchpads` |

### Conventions

| Task                      | Skill                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Writing Svelte components | [svelte5](./.agents/skills/svelte5/SKILL.md)                 |
| Calling PocketBase / Go   | [pocketbase](./.agents/skills/pocketbase/SKILL.md)           |
| PocketBase subscriptions  | [realtime](./.agents/skills/realtime/SKILL.md)               |
| Auth implementation       | [auth-system](./.agents/skills/auth-system/SKILL.md)         |
| Error handling            | [error-handling](./.agents/skills/error-handling/SKILL.md)   |
| Writing tests             | [testing](./.agents/skills/testing/SKILL.md)                 |
| Code style and commits    | [code-quality](./.agents/skills/code-quality/SKILL.md)       |
| Reviewing changes         | [code-review](./.agents/skills/code-review/SKILL.md)         |
| Writing GitHub issues     | [issue-writing](./.agents/skills/issue-writing/SKILL.md)     |
| Frontend design           | [frontend-design](./.agents/skills/frontend-design/SKILL.md) |
| Deployment context        | [deployment](./.agents/skills/deployment/SKILL.md)           |
| Working notes             | [scratchpads](./.agents/skills/scratchpads/SKILL.md)         |

### PocketBase Tasks

| Task                 | Skill                                              |
| -------------------- | -------------------------------------------------- |
| Schema changes       | [pb-migrate](./.agents/skills/pb-migrate/SKILL.md) |
| Bulk import / revert | [pb-import](./.agents/skills/pb-import/SKILL.md)   |

### Workflow Skills

| Task                      | Skill                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Worktree setup            | [setup](./.agents/skills/setup/SKILL.md)                           |
| Local verification        | [verify](./.agents/skills/verify/SKILL.md)                         |
| Failure triage discipline | [failure-discipline](./.agents/skills/failure-discipline/SKILL.md) |
| PR handoff                | [deliver](./.agents/skills/deliver/SKILL.md)                       |
| PM orchestration          | [pm](./.agents/skills/pm/SKILL.md)                                 |

## Commands

- `/pm` — reviewer-orchestrator mode for multi-step work
- `/review` — review-focused routing to `code-review`
- `/tests` — test-focused routing to `testing`
- `/pr` — PR-focused routing to `deliver`
- `/worktree` — worktree-focused routing to `setup`

## Architecture

### Backend: PocketBase

- Dev server: `http://127.0.0.1:42070` (run with `bun run pb`; override with `PB_PORT`)
- Types auto-generated in `src/lib/pocketbase.schema.ts`
- Custom Go hooks for balance calculations: `pocketbase/main.go`
- Collections: accounts, transactions, assets, assetBalances, accountBalances, balanceTypes, transactionLabels, accountShares, assetShares, users

### Frontend: SvelteKit with Svelte 5

Context stores in `src/lib/*.svelte.ts`:

- `auth.svelte.ts` — authentication state
- `pocketbase.svelte.ts` — PocketBase client wrapper
- `accounts.svelte.ts` — account data with real-time updates
- `assets.svelte.ts` — asset tracking
- `transactions.svelte.ts` — transaction filtering/pagination
- `balance-types.svelte.ts` — chart of accounts types
- `cashflow.svelte.ts` — cashflow calculations

Route structure:

- `src/routes/(app)/` — protected routes (requires auth)
- `src/routes/(guest)/` — public routes (auth pages)

### i18n

- Paraglide JS via Inlang
- Locales: English (en), Spanish (es)
- Messages: `$lib/paraglide/messages.js`

## Commands Reference

```bash
# Development
bun run dev              # Vite dev server (default :5173, override with VITE_PORT)
bun run pb               # PocketBase backend (default :42070, override with PB_PORT)
bun run pb:reset         # Reset dev database

# Quality
bun run quality          # Format + lint + type-check
bun run test             # Playwright E2E tests (desktop + mobile)

# Build
bun run build            # Production build
bun run preview          # Preview build (default :42069, override with VITE_PREVIEW_PORT or VITE_PORT)

# Worktrees
bun run worktree:setup <n> <branch> [--base <base>]
bun run worktree:teardown <n> [--prune]
```

## Branches & PRs

- **Branch naming:** `{issue-number}-{short-description}` for issue-driven work; `chore/description` for maintenance
- **Base branch:** `next` for v2 features
- **PR title:** `type: description` (conventional commits)
- **PR body:** Short, include `Closes #123`

## Skill Maintenance

If you discover a repeatable multi-step workflow during a session — something you had to figure out through trial and error, or a sequence the user regularly requests — capture it as a skill so future agents don't have to rediscover the same steps.

Signs you should ask the user whether to capture a skill:

- You spent significant effort discovering a working sequence of commands or decisions
- The user corrected you on a project-specific pattern that isn't documented anywhere
- A task required more than three non-obvious steps that depend on project conventions
- You see yourself repeating the same workflow across multiple requests in one session

When you notice any of these, ask the user if they want to capture it as a skill. Do not create or modify skills without user confirmation.

When creating a new skill (after user confirms):

- Add it to `.agents/skills/<name>/SKILL.md` with frontmatter (`name`, `description`)
- Keep it focused on one workflow or concern
- Write the steps as a blueprint another agent can follow without guessing
- Cross-reference other skills instead of duplicating their content
- Add a row to the appropriate table in this file so the skill is discoverable

When updating an existing skill (after user confirms):

- Prefer extending the existing skill over creating a new overlapping one
- Remove or correct any guidance that no longer matches the repo
- If the skill and the repo disagree, trust the repo and update the skill

## Notes

- PocketBase is built from source on first `bun run pb` (version pinned in `pocketbase/go.mod`)
- Frozen lockfile (`bun.lock`) ensures reproducible builds
- All dependencies are `devDependencies` (SvelteKit bundles everything at build time)
- `CLAUDE.md`, `.claude/`, `.cursor/`, and `.opencode/` are symlinks pointing at this file and `.agents/`
