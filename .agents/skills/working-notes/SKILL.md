---
name: working-notes
description: "Where to put working notes, plans, and research so they don't pollute the repo"
---

# Working Notes

Use working notes for temporary research, plans, and handoff material that should not live in product code or permanent docs.

## Location

Put notes under `.agents/notes/` when they need to survive the current terminal session.

Use a descriptive filename with the date and topic:

```text
.agents/notes/2026-06-06-account-balance-research.md
```

## What belongs here

- Investigation notes that are too long for the final user recap.
- Multi-step plans that may need to be resumed.
- Scratch analysis for complex migrations, refactors, or reviews.
- Handoff notes between sessions or sub-agents when the task spans multiple concerns.

## What does not belong here

- User-facing product documentation.
- Permanent project conventions. Those belong in skills.
- Secrets, tokens, credentials, copied `.env` values, or private customer data.
- Generated command output unless the exact bytes are needed to diagnose a failure.

## Cleanup

Delete stale notes once the work is complete unless the user asks to keep them. If a note captures a reusable workflow, ask whether to turn it into a skill instead of leaving it as scratch material.
