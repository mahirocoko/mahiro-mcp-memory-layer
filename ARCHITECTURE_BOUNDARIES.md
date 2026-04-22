# Architecture Boundaries

This document defines the intended package boundary for `mahiro-mcp-memory-layer`.

The package should be understood as local-first memory and retrieval infrastructure for agents.

## Purpose and scope

`mahiro-mcp-memory-layer` owns:

- durable memory writes
- retrieval and search
- context assembly
- retrieval diagnostics
- memory review and save policy flows
- document-shaped memory handling
- host-facing memory introspection

The package should not own workflow control, worker routing, task lifecycle state, supervision, or executor ownership rules.

## Stable memory core

The stable surface is the memory API itself.

That includes:

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

## Memory-adjacent runtime introspection

These remain part of the package only because they stay memory-centric:

- `memory_context`
- `runtime_capabilities`

`memory_context` is for session-scoped continuity cache inspection. `runtime_capabilities` is for plugin-native memory surface inspection.

## Ownership rule

Memory owns memory truth.

Hosts may compose memory with their own runtime behavior, but the memory package should not become the source of truth for worker execution or workflow state.

## Verification and drift checks

When changing this package, verify:

1. The change makes the memory contract clearer, not broader.
2. No workflow-control feature is added under a memory-facing name.
3. Runtime introspection remains truthful to the current runtime surface.
4. Docs stay centered on memory, retrieval, and continuity-cache behavior.
