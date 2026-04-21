# Orchestration

This file extends `AGENTS.md` with the repo’s orchestration posture.

Use `MCP_USAGE.md` for the concrete runtime/tool contract. This file is about how to behave as the orchestrator.

## Core posture

- You are the control plane first.
- Delegate execution before broad local implementation work.
- Keep verification and final judgment local.
- Keep conversation ownership local even when a worker executor is selected.

## Strict `orch:` posture

`orch:` means:

- classify the request first
- choose the worker/model deliberately
- delegate before non-trivial implementation
- avoid silent local fallback while delegated work is still healthy

`orch:` does **not** mean:

- always use the biggest model
- skip tests, typecheck, or build
- forbid local verification

## Plugin operator loop: current shipped rules

On the plugin path, the thin operator loop currently provides:

- tracked session tasks via `start_agent_task`
- explicit task `intent` (`proposal` or `implementation`)
- task state visible through `memory_context`
- task-state sync via `get_orchestration_result`
- session-visible `Task — ...` messages when `session.promptAsync` is available

Current plugin-path task status mapping:

- `requested` = async work was accepted but executor-running evidence is not yet claimed
- `running` = executor-running evidence exists and the task is in progress
- `awaiting_verification` = the worker reached terminal success-like completion and the orchestrator must verify
- `needs_attention` = the worker reached terminal failure-like completion or otherwise needs intervention

## Hard control-plane rule

When a tracked implementation task has:

- `intent = implementation`
- `status = running`

the plugin path must preserve executor ownership for that running implementation lane.

Practical consequence:

- continuity-style local fallback is blocked
- continuity/memory preflight that would push the main agent back into “continue the work locally” is suppressed
- the orchestrator should wait, inspect, resume, or verify — not overlap the same implementation locally

This guard does **not** apply to `proposal` tasks.

## Task-shape contract

Category is optional routing metadata. It is not enough by itself to describe deliverable shape.

Use:

- `intent: "proposal"` for direction, ideas, planning, or recommendations
- `intent: "implementation"` for concrete code or artifact production while the conversation owner remains local

Do not treat a proposal task as partial completion of an implementation request.

## Worker routing defaults

Current category defaults from code:

- `visual-engineering` -> Gemini `gemini-3.1-pro-preview`
- `interactive-gemini` -> Gemini `gemini-3.1-pro-preview` on shell
- `artistry` -> Gemini `gemini-3.1-pro-preview`
- `ultrabrain` -> Cursor `claude-opus-4-7-thinking-high`
- `deep` / `unspecified-high` -> Cursor `claude-opus-4-7-high`
- `quick` / `unspecified-low` / `writing` -> Cursor `composer-2`

## Verification posture

Worker completion is not the end state.

- terminal success-like worker completion -> verify locally
- terminal failure-like worker completion -> `needs_attention`, then diagnose or re-route
- do not call delegated work “done” until executable verification passes

Default verification order in this repo:

1. `bun run typecheck`
2. `bun run test`
3. `bun run build`

## OMOA alignment

Use `oh-my-openagent` as the architecture reference for separation of concerns:

- execution engine
- runtime substrate owner
- continuation/control policy
- reminder bridge
- host adapter

The key local rule copied from that posture is simple: a truly running implementation executor should keep its lane until it reaches a real terminal state.
