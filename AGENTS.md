# Agent

Start here, then load the narrower doc that matches your task.

- Use `README.md` for package overview, install, and human-facing command/reference material.
- Use `MCP_USAGE.md` for the practical runtime/tool surface and the plugin-vs-MCP mode split.
- Use `ORCHESTRATION.md` for orchestrator posture, worker routing, and the current operator-loop rules.
- Use `CONTINUITY_DEBUGGING.md` when the task is about memory continuity, recall, or why continuity did or did not trigger.

## Repo identity

- Package / MCP server: `mahiro-mcp-memory-layer`
- Stable default surface today: plugin-native memory tools plus a thin plugin-native orchestration façade
- Source checkout path: may additionally expose the standalone MCP orchestration surface

## Current posture

- Treat memory as the stable foundation.
- Treat orchestration as a thin control-plane layer over worker execution, not as a second copy of the memory system.
- Keep memory and orchestration decoupled.
- Prefer the plugin-native façade first when you are on the plugin path.

## Documentation boundaries

- `README.md` is human-facing.
- `MCP_USAGE.md` and `ORCHESTRATION.md` are AI-consumer-facing.
- Do not promise tools or states that the current runtime does not actually expose.

## Minimal guardrails

- Verify before declaring done.
- Default verification order: `bun run typecheck`, `bun run test`, `bun run build`.
- Preserve history and never force-push.
- Check `runtime_capabilities` before claiming orchestration is available.
- On the plugin path, `start_agent_task` now requires an explicit task `intent` (`proposal` or `implementation`).
- A running delegated `implementation` task on the plugin path blocks continuity-style local fallback until the task leaves `running`.
