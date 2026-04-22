# Mahiro MCP Memory Layer

Local-first agent memory and retrieval infrastructure for OpenCode.

This package is memory-only. It provides durable memory writes, retrieval, context assembly, retrieval inspection, memory review flows, and plugin-native continuity helpers such as `memory_context` and `runtime_capabilities`.

## What ships today

### 1. Standard plugin install

Add the package name to OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["mahiro-mcp-memory-layer"]
}
```

On this path, OpenCode gets the memory tools natively from the in-process backend, plus these plugin-only helpers:

- `memory_context`
- `runtime_capabilities`

### 2. Source checkout / standalone MCP path

If OpenCode loads this repo from a source checkout, or if you run the standalone server directly, the standalone MCP server exposes the same memory-focused tool family.

Local development plugin path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer"]
}
```

Standalone server commands:

```bash
bun run dev
bun run start
```

## Memory tools

The stable tool surface is:

- `inspect_memory_retrieval`
- `reset_memory_storage`
- `promote_memory`
- `review_memory`
- `remember`
- `search_memories`
- `build_context_for_task`
- `upsert_document`
- `list_memories`
- `list_review_queue`
- `list_review_queue_overview`
- `get_review_assist`
- `enqueue_memory_proposal`
- `suggest_memory_candidates`
- `apply_conservative_memory_policy`
- `prepare_host_turn_memory`
- `wake_up_memory`
- `prepare_turn_memory`

Plugin-native extras:

- `memory_context`
- `runtime_capabilities`

## Commands

```bash
bun install
bun run dev
bun run start
bun run typecheck
bun run test
bun run build
bun run reindex
```

## Docs map

- `README.md` — package overview and human-facing reference
- `MCP_USAGE.md` — AI-facing runtime/tool guide
- `CONTINUITY_DEBUGGING.md` — continuity and memory debugging guide
- `ARCHITECTURE_BOUNDARIES.md` — memory-only package boundary
- `AGENT_NEXT_STEPS.md` — current direction and follow-up work
- `AGENTS.md` — thin entrypoint for agents
