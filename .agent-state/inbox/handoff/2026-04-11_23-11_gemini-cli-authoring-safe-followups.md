# Handoff: Gemini CLI authoring-safe follow-ups

**Date**: 2026-04-11 23:11
**Context**: Gemini async worker reliability fixes, retry observability, polling coverage, and typed Gemini CLI controls are complete and verified.

## What We Did
- Added retry configuration and shell pinning for direct async Gemini worker starts.
- Mirrored shell pinning for direct async Cursor starts so runtime behavior is symmetric.
- Extended result store metadata, traces, and async polling responses to expose configured retry policy plus terminal retry outcomes.
- Fixed README and orchestration docs so async polling behavior and Gemini runtime behavior match the real implementation.
- Added polling tests for `running` and top-level `runner_failed` responses.
- Added typed Gemini CLI control support for `approvalMode` and `allowedMcpServerNames` across parser, schema, shell runtime, MCP forwarding, workflow normalization, tests, and docs.
- Tightened the allowlist contract so shell serialization is lossless (`none` reserved, comma-containing names rejected).

## Pending
- [ ] Decide whether to add a higher-level convenience field such as `cliProfile: "authoring-safe"` instead of requiring callers to set `approvalMode` and `allowedMcpServerNames` manually.
- [ ] Investigate whether stale async `running` records need a watchdog/reconciler or richer diagnostics.
- [ ] Evaluate whether Gemini command docs should explicitly list `--cwd` and `--timeout-ms` alongside the new control flags instead of relying on examples.

## Next Session
- [ ] Prototype an authoring-safe Gemini preset shape and compare it against the current explicit-field approach.
- [ ] Audit async worker lifecycle for process death/finalization gaps and decide whether a stale-record sweeper belongs in orchestration.
- [ ] Re-check Gemini CLI upstream docs for any formal documentation of `none`-style allowlist behavior before broadening the local contract further.

## Key Files
- `src/features/gemini/gemini-cli.ts`
- `src/features/gemini/schemas.ts`
- `src/features/gemini/runtime/shell/shell-gemini-runtime.ts`
- `src/features/gemini/runtime/mcp/mcp-gemini-runtime.ts`
- `src/features/gemini/mcp/register-gemini-worker-tools.ts`
- `src/features/orchestration/mcp/async-worker-tools.ts`
- `src/features/orchestration/observability/orchestration-result-store.ts`
- `src/features/orchestration/observability/orchestration-trace.ts`
- `README.md`
