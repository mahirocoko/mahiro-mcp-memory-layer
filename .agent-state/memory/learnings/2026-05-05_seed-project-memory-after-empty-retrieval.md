# Seed project memory after empty retrieval

**Date**: 2026-05-05
**Tags**: memory, retrieval-diagnostics, continuity, local-state

## Lesson

When retrieval traces show `returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false`, do not assume retrieval is broken. First check the active `projectId` and `containerId`, then list durable memories in that exact scope. In this session, the current project had 580 retrieval traces with zero hits and zero degraded rows, and every durable memory kind was empty. The correct fix was to seed verified project memories, not change retrieval code.

## Evidence

- `rtk bun run typecheck`, `rtk bun run test`, and `rtk bun run build` passed.
- Memory viewer served HTTP 200 on localhost.
- `list_memories` was empty before seeding.
- Four verified memories were added for project boundary, lifecycle contract completion, operational baseline, and working-tree artifact status.

## Reuse

For future continuity debugging in this repo, follow: `memory_context` → `inspect_memory_retrieval` → `runtime_capabilities` → `list_memories` for the exact scope before treating empty context as a bug.
