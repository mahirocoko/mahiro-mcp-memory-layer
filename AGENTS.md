# Agent

Start here, then load the narrower doc that matches your task:

- Use `README.md` for package overview, install, and command/reference material.
- Use `MCP_USAGE.md` for the practical MCP/runtime tool surface, plugin-vs-MCP mode split, async waiting, and trace/result flows.
- Use `ORCHESTRATION.md` for orchestrator posture, worker routing, delegation rules, and verification policy.

## Repo identity

- Package / MCP server: `mahiro-mcp-memory-layer`
- Standard plugin path: plugin-native memory surface first
- Source checkout path: may additionally expose the standalone MCP/orchestration surface

## Minimal guardrails

- Verify before declaring done.
- Default verification order: `bun run typecheck`, `bun run test`, `bun run build`.
- Preserve history and never force-push.
- Do not present orchestration tools as guaranteed unless the current runtime mode actually exposes them; check `MCP_USAGE.md` for the mode split.
