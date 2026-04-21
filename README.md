# Mahiro MCP Memory Layer

Local-first memory layer for OpenCode with a thin plugin-native orchestration façade.

## What ships today

There are two important product shapes.

### 1. Standard plugin install

Add the package name to OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["mahiro-mcp-memory-layer"]
}
```

On this path, OpenCode gets the memory tools natively from the in-process backend, plus these plugin-only diagnostics and orchestration helpers:

- `memory_context`
- `runtime_capabilities`
- `start_agent_task`
- `get_orchestration_result`
- `inspect_subagent_session`

Important plugin-path notes:

- `start_agent_task` requires `prompt` and explicit `intent` (`proposal` or `implementation`); `category` is now optional routing metadata
- the plugin operator ledger tracks task intent and status in `memory_context.session.operator`
- a `requested` implementation task does not suppress continuity-style preflight; only a truly `running` implementation task can do that
- successful terminal workflow results map to `awaiting_verification`
- failed terminal workflow results map to `needs_attention`

### 2. Source checkout / standalone MCP path

If OpenCode loads this repo from a source checkout, or if you run the standalone server directly, the broader MCP orchestration surface can be available too.

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

The stable memory surface is:

- `remember`
- `search_memories`
- `build_context_for_task`
- `upsert_document`
- `list_memories`
- `suggest_memory_candidates`
- `apply_conservative_memory_policy`
- `prepare_host_turn_memory`
- `prepare_turn_memory`
- `wake_up_memory`
- `inspect_memory_retrieval`

Plugin-native extras:

- `memory_context`
- `runtime_capabilities`

## Thin plugin orchestration façade

Use `start_agent_task` when you want the plugin path to drive Gemini or Cursor as explicit executors while the main conversation owner stays local. `category` is an optional preset, not the task-shape truth.

Current routing defaults:

- `visual-engineering` -> Gemini `gemini-3.1-pro-preview`
- `interactive-gemini` -> Gemini `gemini-3.1-pro-preview` on shell
- `artistry` -> Gemini `gemini-3.1-pro-preview`
- `ultrabrain` -> Cursor `claude-opus-4-7-thinking-high`
- `deep` / `unspecified-high` -> Cursor `claude-opus-4-7-high`
- `quick` / `unspecified-low` / `writing` -> Cursor `composer-2`

The plugin façade is intentionally narrower than the standalone MCP surface. Use `runtime_capabilities` before assuming broader orchestration tools exist.

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
- `ORCHESTRATION.md` — orchestrator posture and operator-loop rules
- `CONTINUITY_DEBUGGING.md` — continuity/memory debugging guide
- `AGENTS.md` — thin entrypoint for agents
