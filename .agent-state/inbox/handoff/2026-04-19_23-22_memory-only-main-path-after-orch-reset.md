# Handoff: Memory-only main path after orchestration reset

**Date**: 2026-04-19 23:22
**Context**: Active `src/` is now memory/plugin-only; old execution stack has been removed from `src/`

## What We Did
- Compared this repo against `oh-my-openagent` and decided to stop carrying forward the old plugin-centric orchestration design.
- Removed old orchestration behavior from the active plugin path and rebuilt the main runtime around memory/plugin behavior only.
- Removed `src/features/gemini/**`, `src/features/cursor/**`, `src/features/orchestration/**`, and `src/legacy/**` from active `src/`.
- Cut the active MCP server back to memory-only registration.
- Removed historical orchestration tests from the active test path and kept package/plugin verification focused on the new reduced surface.
- Ran `bun run typecheck` and active tests successfully.

## Pending
- [ ] Design the new orchestration architecture from scratch in active `src/`.
- [ ] Decide the new boundary between manager, runtime substrate, continuation policy, and adapters.
- [ ] Decide whether any deleted execution components should be selectively reintroduced into active code later or replaced wholesale.
- [ ] Update docs so `ORCHESTRATION.md` and `MCP_USAGE.md` describe the new active reality once the new design exists.

## Next Session
- [ ] Start with a blueprint for the new orchestration manager and runtime substrate ownership.
- [ ] Define the minimal active interfaces needed for a new orchestration path.
- [ ] Add fresh active tests for the new orchestration design instead of reviving deleted historical behavior.

## Key Files
- `src/features/opencode-plugin/runtime-shell.ts`
- `src/features/opencode-plugin/runtime-state.ts`
- `src/features/opencode-plugin/tool-adapter.ts`
- `src/features/opencode-plugin/config.ts`
- `src/features/opencode-plugin/config-loader.ts`
- `src/features/memory/mcp/server.ts`
- Removed trees: `src/features/orchestration/`, `src/features/gemini/`, `src/features/cursor/`, `src/legacy/`
