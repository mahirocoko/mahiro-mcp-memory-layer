# Learning Note: plugin-first-mcp-control-plane

**Date**: 2026-04-10
**Tags**: opencode, plugin, mcp, orchestration, observability, runtime-contract

## Lesson
For this repo, the fastest path to a real OpenCode-first product was not replacing MCP with plugin-native code everywhere. The better move was to let the plugin own the user experience and then use the official plugin `config` hook to inject the pieces OpenCode can already consume: `instructions` for `AGENTS.md`, local MCP config for source-checkout workflows, and a stricter MCP-only orchestration boundary for AI-facing runs. This kept the system compatible with the current platform model while still improving traceability and control-plane clarity.

## Why it matters
The important distinction is between:
- plugin-native capabilities (`memory_context`, memory tools, config loading),
- plugin-injected MCP capabilities (local `orchestrate_workflow` path), and
- shell-backed worker execution hidden behind MCP tools.

Once those are separated, planning gets much easier. We do not need a fantasy “no shell anywhere” target to make the system debuggable. We only need the AI-facing control plane to stop bypassing MCP, and we need observability to record the normalized transport clearly.

## Reuse rule
When integrating more capability into this plugin, prefer this order:
1. plugin-native if the official plugin contract supports it cleanly,
2. plugin `config` hook injection if OpenCode already supports the target config surface,
3. only then consider deeper runtime redesign.

## Concrete reminder
If orchestration should remain MCP-first, enforce it at the MCP tool boundary and persist the normalized `workerRuntimes` into trace/result metadata. That is the lowest-risk place to make the control-plane intent true and auditable.
