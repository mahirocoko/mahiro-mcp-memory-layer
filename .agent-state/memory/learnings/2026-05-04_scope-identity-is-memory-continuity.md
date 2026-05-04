---
tags:
  - memory
  - continuity
  - scope
  - lifecycle
---

# Scope identity is memory continuity

When a memory system uses exact metadata filters, an unstable scope identifier can make existing memory look absent. In `mahiro-mcp-memory-layer`, durable records existed under the stable project name `mahiro-mcp-memory-layer`, but the plugin runtime had resolved the current session to a hash-like `context.project.id`. Search/list tools then returned empty results because `projectId + containerId` did not exactly match.

The lesson is to debug continuity failures in this order: inspect `memory_context` scope, inspect retrieval traces, inspect durable logs, then compare sibling scopes before changing save policy. Stable human-meaningful names should be preferred for recall identity when a container/worktree ID still provides isolation. Diagnostics should explicitly say when memories exist under nearby scopes so the user sees “scope mismatch” instead of “no memory.”

For future lifecycle work, PreCompact and idle persistence must share idempotency keys; otherwise checkpointing can create duplicate writes for the same turn.
