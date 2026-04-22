# Agent

Start here, then load the narrower doc that matches your task.

- Use `README.md` for package overview, install, and human-facing command/reference material.
- Use `ARCHITECTURE_BOUNDARIES.md` when the task is about long-term package scope or the intended memory boundary.
- Use `AGENT_NEXT_STEPS.md` when the task is about current direction or follow-up work.
- Use `MCP_USAGE.md` for the practical runtime/tool surface.
- Use `CONTINUITY_DEBUGGING.md` when the task is about memory continuity, recall, or why continuity did or did not trigger.

## Repo identity

- Package / MCP server: `mahiro-mcp-memory-layer`
- Stable default surface today: plugin-native memory tools plus memory-focused plugin helpers
- Source checkout path: may also expose the standalone memory MCP server

## Current posture

- Treat memory as the product identity.
- Keep continuity-cache helpers memory-facing.
- Do not promise workflow or executor features that this package does not own.

## Documentation boundaries

- `README.md` is human-facing.
- `MCP_USAGE.md` and `CONTINUITY_DEBUGGING.md` are AI-consumer-facing.
- Do not promise tools or states that the current runtime does not actually expose.

## Minimal guardrails

- Verify before declaring done.
- Default verification order: `bun run typecheck`, `bun run test`, `bun run build`.
- Preserve history and never force-push.
