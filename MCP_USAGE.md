# MCP Usage

Use this file for the practical runtime surface of this repo.

`README.md` is the human-facing package reference. This file is the runtime/tool contract guide for the memory-only package surface.

## Runtime modes

### Plugin-native path

Default assumption for the published plugin.

Guaranteed memory tools:

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
- `memory_context`
- `runtime_capabilities`

Plugin-path notes:

- `memory_context` exposes session-scoped continuity cache and runtime metadata, separate from durable memory records.
- `runtime_capabilities` reports the plugin-native memory surface that is currently available.
- `runtime_capabilities` stays memory-scoped and includes tool names, lifecycle diagnostics, compaction continuity flags, and memory protocol guidelines.
- session-start wake-up, turn preflight, idle persistence, and compaction continuity are plugin-native memory behaviors.

Memory lifecycle contract:

- `session-start-wake-up` prepares continuity when a session starts.
- `turn-preflight` prepares memory before a turn is handled.
- `idle-persistence` preserves memory when the session goes idle.
- `compaction-continuity` preserves a memory checkpoint across compaction.

Compaction continuity is append-only and fail-open. It keeps memory continuity moving forward even when a backend write cannot complete.

### Standalone MCP path

On a source checkout or standalone server path, the repo can also expose the same memory-focused tools through the standalone MCP server.

## `runtime_capabilities`

Use this to read the current plugin-native memory capability contract.

Current shape:

- `mode: "plugin-native"`
- `memory.toolNames`
- `memory.sessionStartWakeUpAvailable`
- `memory.turnPreflightAvailable`
- `memory.idlePersistenceAvailable`
- `memory.memoryContextToolAvailable`
- `memory.lifecycleDiagnosticsAvailable`
- `memory.compactionContinuityAvailable`
- `memory.memoryProtocol.version`
- `memory.memoryProtocol.guidelines`

This object is a memory contract, not a hook runtime contract. The protocol guidelines are startup/orientation guidance for memory use; they do not create workflow ownership.

## `memory_context`

Use this to inspect the plugin-side session cache.

Look for:

- current scope resolution
- latest event type
- coordination state such as message debounce versioning
- startup brief
- continuity cache entries:
  - `wakeUp`
  - `prepareTurn`
  - `prepareHostTurn`

`memory_context` should stay memory-facing. It is useful for continuity debugging, cache inspection, and understanding what memory preparation already happened for the active session.

The continuity cache can surface `wakeUp`, `prepareTurn`, `prepareHostTurn`, and lifecycle diagnostics for the memory stages above.

## Practical safety reminders

- Treat `memory_context` as continuity-cache inspection, not as durable memory storage.
- Use `inspect_memory_retrieval` before guessing why retrieval hit, missed, or degraded.
- When `inspect_memory_retrieval` returns an empty latest lookup with `latestScopeFilter`, the scoped trace lookup missed for that `projectId`/`containerId`; it does not prove the global trace store is empty.
- `returnedMemoryIds: []` with `degraded: false` means no scoped matches and no rendered context, not degraded retrieval.
- Check `projectId` and `containerId`, durable memory records or counts, and `memory_context` continuity cache separately.
- Prefer the stable memory tools over host-specific session cache details when building product behavior.
- Use host lifecycle details only as memory diagnostics, not as a runtime ownership signal.
