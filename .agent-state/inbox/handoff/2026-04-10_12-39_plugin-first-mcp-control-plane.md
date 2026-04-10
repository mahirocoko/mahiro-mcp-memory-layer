# Handoff: plugin-first-mcp-control-plane

**Date**: 2026-04-10 12:39
**Context**: 92%

## What We Did
- Turned `mahiro-mcp-memory-layer` into a plugin-first OpenCode integration that now injects native memory tools, packaged `AGENTS.md` instructions, and local source-checkout MCP config through the plugin `config` hook.
- Verified `memory_context` and `orchestrate_workflow` through real `opencode run` sessions, not just unit tests.
- Formalized plugin config loading with user/project/environment precedence and split the plugin runtime shell into smaller modules.
- Forced the AI-facing orchestration path to normalize workflow jobs onto `workerRuntime: "mcp"` on the MCP control plane.
- Added persisted `workerRuntimes` metadata to orchestration traces and result metadata so MCP-first runs are visible in observability data.

## Pending
- [ ] Decide whether the package-name plugin install path should ever inject MCP fallback too, or whether MCP injection should remain source-checkout-only.
- [ ] Reduce orchestration timeout pain further by improving async-first UX and/or making sync constraints harder to misuse.
- [ ] Decide whether duplicated plugin runtime helpers (`asRecord`, `toNonEmptyString`) should be centralized now that the module split is stable.

## Next Session
- [ ] Start with the timeout-pain pass on orchestration UX: inspect `src/features/orchestration/mcp/register-tools.ts` and related tests for the smallest async-first improvement.
- [ ] If needed, add clearer metadata or result messaging that tells callers when a workflow was auto-async vs explicitly async.
- [ ] Re-evaluate local-only MCP injection vs package-name install behavior after the orchestration UX pass, with real OpenCode runtime checks.

## Key Files
- `src/features/opencode-plugin/index.ts`
- `src/features/opencode-plugin/instructions-config-adapter.ts`
- `src/features/opencode-plugin/mcp-config-adapter.ts`
- `src/features/opencode-plugin/config-loader.ts`
- `src/features/orchestration/mcp/register-tools.ts`
- `src/features/orchestration/workflow-spec.ts`
- `src/features/orchestration/observability/orchestration-trace.ts`
- `src/features/orchestration/observability/orchestration-result-store.ts`
- `AGENTS.md`
- `README.md`
