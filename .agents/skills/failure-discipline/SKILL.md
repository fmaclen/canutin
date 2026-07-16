---
name: failure-discipline
description: Error diagnosis rules, push discipline, CI cost awareness
---

# Failure Discipline

## Read the Error Before Fixing

After a failed CI run or local quality error, read the actual error output and identify the specific message. Do not push a speculative code fix.

## One Push, One Verify

Never push again until you've confirmed the previous push either succeeded or you've identified why it failed.

## Two Strikes, Report

If two consecutive pushes fail for the same reason, stop and report the error to the human. You are likely missing context that isn't in the codebase.

## Each Push Is Expensive

Every push to a PR branch triggers the full Playwright suite across desktop and mobile. That is a long run and consumes CI minutes. Unnecessary pushes waste time and create noise.

## CI Is a Limited Resource

If CI is failing on infrastructure issues (PocketBase dev server not starting, GitHub Actions runner allocation failures, paraglide messages not compiled), do not re-trigger. Report the issue to the human and wait.

## Agent Behavior

- **DO** read CI logs and PocketBase logs before diagnosing failures
- **DO** verify each push succeeded before moving on
- **DO** stop and report after two consecutive failures
- **DO** verify locally before pushing - see [verify](../verify/SKILL.md)
- **DON'T** push speculative fixes — diagnose from logs first
- **DON'T** re-trigger CI when it fails on infrastructure issues
- **DON'T** change test files or timeouts when debugging CI flakiness

## See Also

- [verify.md](../verify/SKILL.md) - Local verification workflow
- [testing.md](../testing/SKILL.md) - Running tests locally
