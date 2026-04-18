---
description: Index for skills, aliases, and workflow routing
audience: [all]
---

# Skills

## Overview

Skills for agents working on canutin — from worktree setup to backend migrations to PR handoff.

Intent aliases improve retrieval without duplicating canonical rules:

| Alias           | Canonical     |
| --------------- | ------------- |
| `tests`         | `testing`     |
| `review`        | `code-review` |
| `pr`            | `deliver`     |
| `worktree`      | `setup`       |
| `orchestrate`   | `pm`          |
| `working-notes` | `scratchpads` |

## Phases

1. **Setup** — create a worktree, install deps, initialize env → [setup.md](./setup/SKILL.md)
2. **Understand** — read `AGENTS.md` and load relevant convention skills for your task
3. **Implement** — write code following conventions (see Conventions table below)
4. **Verify** — run `bun run quality` and Playwright locally → [verify.md](./verify/SKILL.md)
5. **Deliver** — create a PR and hand off → [deliver.md](./deliver/SKILL.md)

## Conventions

| Skill                                         | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| [svelte5](./svelte5/SKILL.md)                 | Svelte 5 runes, events, snippets, navigation |
| [code-quality](./code-quality/SKILL.md)       | TypeScript, Prettier, conventional commits   |
| [code-review](./code-review/SKILL.md)         | Review checklist, every-function rules       |
| [testing](./testing/SKILL.md)                 | Playwright E2E, seeding helpers, selectors   |
| [realtime](./realtime/SKILL.md)               | PocketBase subscriptions, debouncing         |
| [pocketbase](./pocketbase/SKILL.md)           | Backend schema, Go hooks, admin API          |
| [error-handling](./error-handling/SKILL.md)   | Toasts, tagged logs, Go hook logging         |
| [auth-system](./auth-system/SKILL.md)         | PocketBase users auth, route guard           |
| [frontend-design](./frontend-design/SKILL.md) | Creative design guidance                     |

## Workflow

| Skill                                               | Purpose                                      |
| --------------------------------------------------- | -------------------------------------------- |
| [setup](./setup/SKILL.md)                           | Worktree creation, env, port allocation      |
| [verify](./verify/SKILL.md)                         | Local quality + Playwright verification      |
| [deliver](./deliver/SKILL.md)                       | PR creation, commit format, handoff          |
| [pm](./pm/SKILL.md)                                 | Reviewer-orchestrator workflow               |
| [issue-writing](./issue-writing/SKILL.md)           | GitHub issue titles and problem-first bodies |
| [failure-discipline](./failure-discipline/SKILL.md) | Error diagnosis and push discipline          |
| [deployment](./deployment/SKILL.md)                 | Docker build + semantic-release              |
| [scratchpads](./scratchpads/SKILL.md)               | Working documents directory and naming       |

## PocketBase Task Skills

| Skill                               | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| [pb-migrate](./pb-migrate/SKILL.md) | Schema changes via admin API (auto JS migrations) |
| [pb-import](./pb-import/SKILL.md)   | Bulk import and revert via custom API routes      |

## Key Principles

- **Ask, don't spin.** If stuck, explicitly tell the user what you need.
- **Delegate and parallelize.** Spin up multiple agents for independent subtasks.
- **Keep refactors lossless.** Preserve still-valid facts; never silently drop guidance.
- **Trust the repo over the skill.** If a skill and the repo disagree, update the skill.
