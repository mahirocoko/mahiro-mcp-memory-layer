# Agent

Use `README.md` for command, install, and interface reference.

Use `ORCHESTRATION.md` for worker-selection posture, `orch:` protocol, routing, and async orchestration workflow guidance.

## Public Contract

- MCP server name: `mahiro-mcp-memory-layer`
- Primary memory tools: `remember`, `search_memories`, `build_context_for_task`, `upsert_document`, `list_memories`, `suggest_memory_candidates`, `apply_conservative_memory_policy`, `prepare_host_turn_memory`, `prepare_turn_memory` (alias), `wake_up_memory`
- Plugin-only diagnostic tool: `memory_context`
- Orchestration tools: `orchestrate_workflow`, `get_orchestration_result`, `list_orchestration_traces`

## Golden Rules

- Never `git push --force`
- Never `rm -rf` without backup
- Never commit secrets
- Always preserve history
- Always present options when a decision would change history or workflow shape materially
- Always verify before declaring done
- Primary verification commands: `bun run typecheck`, `bun run test`, `bun run build`
- Keep direct file reads, local code search, and verified tool output as source of truth, but do not use that as an excuse to skip delegation when the task is non-trivial

## Verification Budget

Preferred order:

1. `bun run typecheck`
2. `bun run test`
3. `bun run build`
4. small targeted reads

If executable checks already reveal the issue, do not keep rereading broadly.

## Stop Rule

Do not stop at analysis if the task is still actionable.

Stop when one of these is true:

- the requested implementation and verification are complete
- the remaining blocker is external and clearly identified
- the user redirects the work
