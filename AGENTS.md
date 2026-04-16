# Agent

Start here, then load the narrower doc that matches your task:

- Use `README.md` for package overview, install, and command/reference material.
- Use `MCP_USAGE.md` for the practical MCP/runtime tool surface, plugin-vs-MCP mode split, async waiting, and trace/result flows.
- Use `ORCHESTRATION.md` for orchestrator posture, worker routing, delegation rules, and verification policy.

## Repo identity

- Package / MCP server: `mahiro-mcp-memory-layer`
- Standard plugin path: plugin-native memory surface first
- Source checkout path: may additionally expose the standalone MCP/orchestration surface

## Documentation boundary rules

- When editing `MCP_USAGE.md` or `ORCHESTRATION.md`, write for AI agents consuming this MCP from other repositories, not primarily for maintainers working inside this repo.
- Keep `README.md` human-facing. Keep `MCP_USAGE.md` and `ORCHESTRATION.md` consumer-AI-facing.
- Do not turn `MCP_USAGE.md` or `ORCHESTRATION.md` into local dev notes for this repo unless that guidance is also genuinely useful to external AI consumers.

## Minimal guardrails

- Verify before declaring done.
- Default verification order: `bun run typecheck`, `bun run test`, `bun run build`.
- Preserve history and never force-push.
- Do not present orchestration tools as guaranteed unless the current runtime mode actually exposes them; check `MCP_USAGE.md` for the mode split.
- When a user explicitly asks for interactive OpenCode testing, or explicitly asks for `tmux` + `opencode` + `send-keys`, use that live interactive path for the test step. Do not silently substitute headless `opencode run`, MCP worker calls, or other non-interactive shortcuts for the requested validation mode.
