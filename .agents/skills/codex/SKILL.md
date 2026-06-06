---
name: codex
description: Harness-specific quirks for Codex sessions - spawn_agent rules and validation gotchas
---

# Codex

Load this when your system prompt opens with "You are Codex" - you are running inside the Codex CLI or Codex Desktop harness. These rules supplement the orchestrator and executor skills; they do not replace them.

## Scope: Orchestrator-only

Everything below applies when you are operating as the Orchestrator. If you ARE a sub-agent (your invocation assigned you the executor role), close this skill and execute your assigned task with your own tools - the standing-permission and `spawn_agent` validation rules in this file are about how the parent delegates, not about how an executor does its work. An executor without a `spawn_agent` tool is normal and expected; executors never delegate.

## Standing permission to delegate

Codex's `spawn_agent` tool description says it should only be used "when the user explicitly asks for delegation." That predates the orchestrator skill. By being assigned the Orchestrator role per AGENTS.md, the user has already given you a standing, session-wide explicit ask for delegation. You do not need a per-task confirmation. Do not stall waiting for the user to re-ask. Do not silently default to `exec_command` when `spawn_agent` exists - that is the most common Codex failure mode.

## spawn_agent validation

If you set `agent_type` (`explorer`, etc.), do not also set `fork_context: true` - Codex rejects the combination. Either pick a typed sub-agent with a fresh context, or fork the parent context and inherit its agent type, model, and reasoning effort.
