# Handoff: Orch Guardrails and Doc Realignment

**Date**: 2026-04-20 19:11
**Context**: orchestration control-plane hardening, docs rewrite, and category-default cleanup completed

## What We Did
- Added explicit delegated task `intent` (`proposal` / `implementation`) to the plugin-native orchestration façade and workflow metadata.
- Fixed plugin operator-loop task-state mapping so terminal failures become `needs_attention` instead of being treated like verification-ready success.
- Blocked continuity-style preflight while a delegated implementation task is still `running`, preserving delegated ownership.
- Added regression coverage for intent threading, terminal-state sync, blocked implementation continuity, and non-blocked proposal continuity.
- Rewrote the main docs (`README.md`, `MCP_USAGE.md`, `ORCHESTRATION.md`, `ORCH_SESSION_TEMPLATE.md`, `CONTINUITY_DEBUGGING.md`, `AGENTS.md`) to match shipped runtime behavior.
- Updated the `artistry` category default to `gemini-3.1-pro-preview`.

## Pending
- [ ] Decide whether to add a public plugin finalize surface so verified tasks can transition to exposed `completed`.
- [ ] Decide whether the broader MCP-capable orchestration docs should be expanded again later or kept thin until more surface is actually stabilized.

## Next Session
- [ ] If needed, design a minimal plugin finalize tool that only mutates the session operator ledger after external verification.
- [ ] Add any remaining orchestration-state regression tests before widening the plugin façade.

## Key Files
- `src/features/opencode-plugin/runtime-shell.ts`
- `src/features/opencode-plugin/runtime-state.ts`
- `src/features/orchestration/workflow-spec.ts`
- `src/features/orchestration/mcp/register-tools.ts`
- `tests/product-memory-plugin.test.ts`
- `MCP_USAGE.md`
- `ORCHESTRATION.md`
