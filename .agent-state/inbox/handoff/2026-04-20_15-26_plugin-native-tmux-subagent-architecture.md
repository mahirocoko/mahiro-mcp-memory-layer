# Handoff: Plugin-native tmux subagent architecture

**Date**: 2026-04-20 15:26
**Context**: 90%

## What We Did
- Reoriented orchestration around plugin-native spawned tmux subagents instead of MCP-first worker calls.
- Added plugin-native orchestration tools: `start_agent_task`, `get_orchestration_result`, `inspect_subagent_session`.
- Introduced durable subagent lineage with persisted `subagentId`, `sessionName`, and `paneId`.
- Unified shell worker lanes around tmux-managed subagent execution.
- Fixed Gemini normal-mode tmux path enough to get a clean live `READY` response with `timedOut: false` on a fresh lineage.
- Removed stale MCP-first tests and cleaned leftover MCP-oriented product surface.

## Pending
- [ ] Add a focused plugin-native regression test that proves start + completion reminders return to the same main session.
- [ ] Tighten Gemini resume/follow-up behavior for reused sessions.
- [ ] Recheck docs for any wording that still implies MCP-first orchestration is part of the supported path.

## Next Session
- [ ] Validate a full `orch:` user flow in a fresh session using Gemini on a real visual task.
- [ ] Add the missing plugin-native reminder regression test.
- [ ] Decide whether to narrow or simplify any remaining subagent control surfaces that are not needed on the main agent path.

## Key Files
- `src/features/opencode-plugin/runtime-shell.ts`
- `src/features/opencode-plugin/tool-adapter.ts`
- `src/features/opencode-plugin/runtime-capabilities.ts`
- `src/features/orchestration/subagents/tmux-subagent-manager.ts`
- `src/features/orchestration/runtime/tmux-runtime-owner.ts`
- `src/features/gemini/runtime/tmux/interactive-gemini-tmux-runtime.ts`
