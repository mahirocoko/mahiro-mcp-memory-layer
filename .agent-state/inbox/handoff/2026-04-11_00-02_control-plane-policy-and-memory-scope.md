# Handoff: Control Plane Policy and Memory Scope

**Date**: 2026-04-11 00:02
**Context**: 92%

## What We Did
- Clarified async MCP worker flows and sync-call guardrails across code, tests, and README, then committed the changes.
- Wrote the control-plane vs execution-plane and token-saving posture into `AGENTS.md`, then committed that doctrine update.
- Fixed OpenCode plugin memory scope binding by adding a stable plugin `userId` path (explicit override plus local fallback), updated tests, verified the repo, seeded durable project memories, and committed the fix.
- Wrote a retrospective and durable learning note under `.agent-state` for this session.

## Pending
- [ ] Start a fresh session and verify `memory_context` now resolves a complete scope from the beginning of the session lifecycle.
- [ ] Decide whether to document `MAHIRO_OPENCODE_PLUGIN_USER_ID` / `runtime.userId` in user-facing plugin config docs.
- [ ] Decide whether the local `.agent-state` retrospective and learning-note files should be committed or kept local-only.

## Next Session
- [ ] Run `/recap` first, then inspect `memory_context` in the new session to confirm the stable local user scope is active.
- [ ] If scope is complete, test the practical retrieval path by using project memory without restating today’s key decisions.
- [ ] Add concise user-facing docs for the plugin user-id override if discoverability still feels weak.

## Key Files
- `AGENTS.md`
- `README.md`
- `src/features/opencode-plugin/config.ts`
- `src/features/opencode-plugin/config-loader.ts`
- `src/features/opencode-plugin/index.ts`
- `src/features/opencode-plugin/runtime-shell.ts`
- `src/features/opencode-plugin/runtime-state.ts`
- `tests/opencode-plugin-config.test.ts`
- `tests/opencode-plugin-package.test.ts`
- `tests/product-memory-plugin.test.ts`
- `.agent-state/memory/retrospectives/2026-04/10/23.59_control-plane-policy-and-memory-scope.md`
- `.agent-state/memory/learnings/2026-04-10_control-plane-policy-and-memory-scope.md`
