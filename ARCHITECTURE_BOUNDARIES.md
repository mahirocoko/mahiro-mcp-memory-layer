# Architecture Boundaries

This document defines the intended package boundary for `mahiro-mcp-memory-layer`.

It exists because the current repo still mixes two ideas:

- a stable, local-first memory layer for agents
- a thin but real orchestration control-plane slice

The direction from recent analysis is to make the memory identity sharper and push broader orchestration concerns out of this package over time.

## Purpose and scope

`mahiro-mcp-memory-layer` should be understood first as memory infrastructure for agents.

The core value of the package is:

- durable memory writes
- retrieval and search
- context assembly
- retrieval diagnostics
- conservative memory save policy
- host-facing memory introspection

The package should not grow into a general workflow engine, worker router, or orchestration runtime.

## System boundary map

There are four distinct concerns.

### 1. Memory layer

Owns:

- storing memory
- retrieving memory
- building context for tasks
- document upsert and document-shaped memory
- retrieval inspection and debugging
- conservative memory save policy

### 2. Orchestration layer

Owns:

- worker selection
- task launching
- task lifecycle state
- executor ownership rules
- supervision, retry, tracing, and workflow progression

### 3. Host adapter

Owns:

- exposing the package into a specific runtime such as OpenCode
- translating host/runtime state into package calls
- deciding what runtime-only helpers are surfaced to end users

### 4. Product or plugin integration

Owns:

- how memory and orchestration are combined in a product
- what continuity policy exists at the host layer
- what diagnostics are shown to users

## Stable surfaces vs conditional surfaces

## Stable memory surface

The stable surface is the memory API itself.

That includes:

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

## Memory-adjacent runtime introspection

These can remain only if they stay memory-centric:

- `memory_context`
- `runtime_capabilities`

`memory_context` should describe memory state and memory-relevant runtime facts. It should not become the long-term home of orchestration truth.

## Conditional orchestration surface

The following are not stable memory APIs. They are orchestration-facing and should be treated as transitionary or externalized over time:

- `start_agent_task`
- `get_orchestration_result`
- `inspect_subagent_session`
- worker routing defaults
- task intent and task status semantics
- standalone orchestration workflow helpers

## What belongs in the memory layer

The package should keep anything that answers one of these questions:

- what should be remembered
- what can be retrieved
- what context should be prepared for this task
- how did retrieval behave
- what memory-related runtime facts are visible now

In practice, that means:

- storage and retrieval primitives
- memory policy and save heuristics
- memory document handling
- retrieval debugging
- memory-focused context assembly

## What must stay out of the memory layer

The package should not own anything whose primary question is:

- who should execute this work
- what worker is currently running
- whether a worker should be resumed, supervised, retried, or replaced
- how workflow states transition over time
- how executor ownership blocks or allows local fallback

Those are orchestration concerns, even when they interact with memory or continuity.

## Control flow, data flow, and ownership rules

## Control flow

Memory tools may be called by a host or orchestrator, but the memory package should not become the source of truth for workflow control.

## Data flow

The memory package can receive task descriptions, recent conversation, and runtime metadata when building context. That does not make it the owner of orchestration state.

## Ownership rule

Memory owns memory truth.

Orchestration owns task truth.

Hosts own product behavior.

If a field or API is primarily needed to answer workflow questions, it belongs outside the memory core.

## Continuity note

Today, some continuity debugging depends on orchestration facts exposed through `memory_context.session.operator.tasks[]`.

That is useful operationally, but it is a boundary smell.

The target direction is:

- memory diagnostics stay here
- orchestration diagnostics move to an orchestration-facing surface
- host continuity logic composes the two instead of collapsing them into one package concept

## Verification and drift checks

When changing this package, verify:

1. The change makes the memory contract clearer, not broader.
2. No new orchestration feature is being added under a memory name.
3. Runtime introspection remains truthful to the current runtime surface.
4. Docs distinguish clearly between current shipped behavior and intended future boundary.

## Current direction

The recommended direction is not “delete every orchestration trace immediately.”

The recommended direction is:

1. treat memory as the product identity
2. treat orchestration helpers as transitionary or host-specific
3. move broader orchestration concerns out of this package
4. keep the package’s public story centered on memory, retrieval, and context

## Related docs

- `README.md` for package overview
- `MCP_USAGE.md` for runtime/tool contract details
- `ORCHESTRATION.md` for the current orchestration posture that is expected to move out over time
- `CONTINUITY_DEBUGGING.md` for current continuity debugging behavior
- `AGENT_NEXT_STEPS.md` for the execution direction from this boundary decision
