# Orch Session Template

Use this when starting a new session and you want the agent to combine strict orchestrator posture with this repo's MCP/runtime surface.

## Recommended Template

```text
orch: Work as a strict orchestrator.

First check `runtime_capabilities`.
- If MCP orchestration is available on the plugin path, turn on sticky orch mode with `orch: on`, use the thin async façade first (`start_agent_task` or `call_worker`), and follow the reminder/resume loop.
- If only plugin-native mode is available, use memory tools normally and do not pretend orchestration exists.
- Never treat `running` as failure.
- Never switch to sync/local fallback just because async is still running.
- When a session-visible reminder arrives with `requestId`/`taskId`, resume through `get_orchestration_result` instead of starting over.
- When a tracked task reaches `awaiting_verification`, finish the operator loop with `mark_orchestration_task_verification` after verification.
- Keep the work minimal, verify results, and report which runtime mode is active before major actions.

On current plugin-capable runtimes, that session-visible reminder can be a plugin-local continuation injected through `session.promptAsync`, not only a separate host reminder UI.
```

## Alternative Template

```text
orch: Use the repo/runtime orchestration tools if available.

Before doing any implementation or deep investigation:
1. Check `runtime_capabilities`
2. If MCP orchestration is available on the plugin path, prefer the thin façade and operator loop first:
   - `orch: on`
   - `call_worker`
   - `start_agent_task`
   - `get_orchestration_result`
   - `supervise_orchestration_result`
   - `get_orchestration_supervision_result`
   - `mark_orchestration_task_verification`
3. Treat `running` as healthy in-progress state
4. Use `memory_context` to inspect the plugin-side `operator` state when you need session task status or sticky orch state
5. Do not fall back to sync/local CLI execution just because async work is still running or a bounded wait timed out
6. Keep plugin-native memory mode and MCP orchestration mode distinct
7. Use raw orchestration surfaces only if the façade is insufficient

If the runtime does not expose orchestration, continue with the available memory/plugin-native tools and say that orchestration is unavailable.
```

## Notes

- `start_agent_task` is the preferred thin async façade for category-routed orchestration when orchestration is available.
- `call_worker` is the preferred thin async façade when you want explicit `gemini` or `cursor` lane selection.
- `runtime_capabilities` is the source of truth for whether the current session is plugin-native only or plugin-native plus MCP orchestration.
- On the plugin path, `orch: on/off/status` is session-scoped operator state, not just prompt convention.
- `memory_context` can expose plugin-side `operator` state for tracked tasks.
- `mark_orchestration_task_verification` is the plugin-local finalize step after verification.
- `running` means in-progress, not stale or failed.
