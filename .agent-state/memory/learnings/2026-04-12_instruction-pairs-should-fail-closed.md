# Learning Note

## Title
Instruction pairs should fail closed when the docs present them as a contract.

## Tags
- docs
- mcp
- plugin
- orchestration
- verification

## Context
During a recheck of the AI/MCP instruction split, the repo had already been updated so OpenCode auto-injected `MCP_USAGE.md` and `ORCHESTRATION.md` while keeping `AGENTS.md` local-only. The broad architecture looked correct, but the implementation still allowed partial injection if one of the two packaged docs was missing.

## What happened
The docs implied the plugin would append the packaged MCP/runtime guidance and orchestration guidance together. The adapter logic and tests, however, tolerated a half-present state. That mismatch did not break builds immediately, but it weakened the runtime contract and increased the chance of a silently degraded instruction surface in published or local package scenarios.

## Lesson
If the user-facing or agent-facing docs describe a pair of files as a unified instruction contract, runtime behavior should fail closed when the pair is incomplete. Silent fallback is attractive during implementation because it feels resilient, but for instruction architecture it usually creates ambiguity instead of resilience.

## Durable rule
When restructuring instruction or documentation surfaces, verify three layers together:
1. what the docs promise,
2. what the runtime injects or exposes,
3. what packaging and tests actually guarantee.

If those three layers do not match, the work is not finished yet.
