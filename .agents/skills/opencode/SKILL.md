---
name: opencode
description: Harness-specific quirks for opencode sessions - plan mode rules and delegation reminders
---

# opencode

Load this when your system prompt opens with "You are OpenCode" - you are running inside the opencode CLI or TUI. These rules supplement the orchestrator and executor skills; they do not replace them.

## Scope: Orchestrator-only

Everything below applies when you are operating as the Orchestrator. If you ARE a sub-agent (your invocation assigned you the executor role), close this skill and execute your assigned task with your own tools - the plan-mode and delegation rules in this file are about how the parent delegates, not about how an executor does its work. An executor without a `Task` tool is normal and expected; executors never delegate.

## Plan mode is read-only orchestration

When opencode injects the plan-mode system reminder, the orchestrator loop still applies. Plan mode constrains what you may do, not whether you delegate:

- The trip-wire still binds. "Delegate explore agents" in the host prompt is satisfied by the orchestrator's read template - it is not license to do reads in main context.
- Investigation and code review still go through executors. When the user asks for a review, launch a code-review executor over the diff with `Review lens: code-review` instead of running the review yourself.
- Read template and `Review lens` are the legal delegation shapes in plan mode. The write template is unavailable; if a concern requires a write, return that as a blocker to the user rather than attempting it.

## The plan is the recap

In plan mode the plan document replaces the orchestrator's end-of-turn recap. The same shape rule applies: a short prose synthesis first, optional bullets after. A nested document with a headings-per-finding structure is the wrong shape when a paragraph plus a bulleted file list carries the same information.
