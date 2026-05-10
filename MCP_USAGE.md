# MCP Usage

Use this file for the practical runtime surface of this repo.

`README.md` is the human-facing package reference. This file is the runtime/tool contract guide for the memory-only package surface.

cocoindex-code owns source, docs, and code corpus indexing. `mahiro-mcp-memory-layer` owns curated memory only. Do not use this package as a source, docs, or code corpus indexer.

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

## Memory console UI

`bun run memory-console` starts the local memory console.

This UI stays inside the memory-only package boundary. It is for local browse, review management, rejected quarantine, guarded rejected cleanup, and graph inspection.

- Browse mode is read-only.
- The graph is derived from memory metadata, read-only, and not canonical storage.
- Rejected purge is rejected-only, guarded, and requires explicit confirmation. It is not the default cleanup path.
- The console is not a hosted admin plane, workflow controller, or executor surface.

## Wiki materializer CLI

`wiki:materialize` is a CLI projection command, not an MCP memory tool. It is separate from `memory_context`, `runtime_capabilities`, and retrieval traces.

It writes generated wiki output from canonical reviewed memory records. It does not treat `memory_context` as source data, and it excludes retrieval traces from materialization.

MVP scope is one way only. There is no bidirectional sync and no import path from wiki output back into memory.

Generated wiki files are derived artifacts. Do not edit them as source data. Regenerate the projection instead.

## `upsert_document`

`upsert_document` stores curated document-shaped memory only. It is not a source, docs, or code corpus indexing API, and it must not be used for crawling, chunking, or batch importing project files. Use `cocoindex-code` for project source/docs/code indexing.

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

Lifecycle helpers are trusted memory persistence and continuity triggers only. They must not expose task execution, worker routing, supervision, executor ownership, or workflow-control state as this package's contract.

## Practical safety reminders

- `inspect_memory_retrieval` exposes `requestId` as the public input. The plugin path may inject scoped latest lookup state internally when no `requestId` is supplied, but `latestScopeFilter` is not a user-facing input.
- `contextSize` is the returned item text payload size, meaning returned `content.length` plus `summary.length` when a summary exists. It is not rendered context length and it is not the continuity-cache size.
- Treat `memory_context` as continuity-cache inspection, not as durable memory storage.
- Do not confuse `wiki:materialize` with `memory_context` or retrieval diagnostics. The CLI is a projection writer, not an MCP memory surface.
- Do not treat the graph as canonical storage. It is a read-only projection from memory metadata.
- Do not treat rejected purge as normal cleanup. It is guarded and rejected-only.
- Use `inspect_memory_retrieval` before guessing why retrieval hit, missed, or degraded.
- When the plugin path returns an empty scoped latest lookup with `latestScopeFilter`, the scoped trace lookup missed for that `projectId`/`containerId`; it does not prove the global trace store is empty.
- `returnedMemoryIds: []` with `degraded: false` means no scoped matches and no rendered context, not degraded retrieval.
- Check `projectId` and `containerId`, durable memory records or counts, and `memory_context` continuity cache separately.
- Prefer the stable memory tools over host-specific session cache details when building product behavior.
- Use host lifecycle details only as memory diagnostics, not as a runtime ownership signal.
