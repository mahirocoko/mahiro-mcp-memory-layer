# Orch Session Template

Use this when starting a new session and you want the agent to combine strict orchestrator posture with this repo's MCP/runtime surface.

## Recommended Template

```text
orch: Work as a strict orchestrator.

First check `runtime_capabilities`.
- If MCP orchestration is available, use the thin async façade first (`start_agent_task`) and follow with supervision/polling tools.
- If only plugin-native mode is available, use memory tools normally and do not pretend orchestration exists.
- Never treat `running` as failure.
- Never switch to sync/local fallback just because async is still running.
- Keep the work minimal, verify results, and report which runtime mode is active before major actions.
```

## Alternative Template

```text
orch: Use the repo/runtime orchestration tools if available.

Before doing any implementation or deep investigation:
1. Check `runtime_capabilities`
2. If MCP orchestration is available, prefer the thin façade first:
   - `start_agent_task`
   - `get_orchestration_result`
   - `supervise_orchestration_result`
   - `get_orchestration_supervision_result`
3. Treat `running` as healthy in-progress state
4. Do not fall back to sync/local CLI execution just because async work is still running or a bounded wait timed out
5. Keep plugin-native memory mode and MCP orchestration mode distinct
6. Use raw orchestration surfaces only if the façade is insufficient

If the runtime does not expose orchestration, continue with the available memory/plugin-native tools and say that orchestration is unavailable.
```

## Notes

- `start_agent_task` is the preferred thin async façade when orchestration is available.
- `runtime_capabilities` is the source of truth for whether the current session is plugin-native only or plugin-native plus MCP orchestration.
- `running` means in-progress, not stale or failed.
