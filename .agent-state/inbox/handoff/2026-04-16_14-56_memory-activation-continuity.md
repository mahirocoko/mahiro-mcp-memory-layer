# Handoff: Memory Activation And Continuity Debugging

**Date**: 2026-04-16 14:56
**Context**: 90%

## What We Did
- Added a runtime capability contract and startup brief so OpenCode sessions can see whether they are running on `plugin-native` or `plugin-native+mcp`.
- Added `inspect_memory_retrieval` and retrieval trace provenance so memory hit/miss debugging can identify the exact source phase (`wake-up`, `turn-preflight`, `host-turn-persistence`, etc.).
- Tuned continuity-oriented preflight routing and added `CONTINUITY_DEBUGGING.md` so host-facing instructions prefer `memory_context` + `inspect_memory_retrieval` before broader recap/search flows.
- Verified behavior repeatedly with fresh `tmux` + interactive `opencode` + `send-keys` sessions rather than substituting headless runs.
- Wrote retrospective and durable learning notes, and refreshed canonical `/learn` docs for `oh-my-openagent`.

## Pending
- [ ] Decide whether to push the current local commit stack to `origin/main` now or batch with one more validation pass.
- [ ] Add one more direct trace-level test for `wake-up-profile` and `wake-up-recent` provenance if extra confidence is desired.
- [ ] Consider documenting more explicitly that `inspect_memory_retrieval({})` returns the latest low-level retrieval pass, not a grouped high-level operation.

## Next Session
- [ ] Start with `/recap` and verify the latest continuity-routing changes on a fresh tmux interactive session.
- [ ] If continuity drift resurfaces, inspect whether host prompt wording or search-mode heuristics still override the memory-first path.
- [ ] Optionally add the wake-up provenance tests and re-run full verification.

## Key Files
- `src/features/opencode-plugin/runtime-capabilities.ts`
- `src/features/opencode-plugin/runtime-shell.ts`
- `src/features/opencode-plugin/instructions-config-adapter.ts`
- `src/features/memory/memory-service.ts`
- `src/features/memory/retrieval/hybrid-search.ts`
- `src/features/memory/types.ts`
- `CONTINUITY_DEBUGGING.md`
- `.agent-state/memory/retrospectives/2026-04/16/14.36_memory-activation-and-interactive-validation.md`
