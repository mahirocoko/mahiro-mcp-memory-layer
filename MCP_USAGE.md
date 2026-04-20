# MCP Usage

Use this file for the practical runtime surface of this repo.

`README.md` is the human-facing package reference. `ORCHESTRATION.md` is the orchestrator posture. This file is the runtime/tool contract guide.

## Runtime modes

### Plugin-native path

Default assumption for the published plugin.

Guaranteed memory tools:

- `remember`
- `search_memories`
- `build_context_for_task`
- `upsert_document`
- `list_memories`
- `suggest_memory_candidates`
- `apply_conservative_memory_policy`
- `prepare_host_turn_memory`
- `prepare_turn_memory`
- `wake_up_memory`
- `inspect_memory_retrieval`
- `memory_context`
- `runtime_capabilities`

Current plugin-native orchestration helpers:

- `start_agent_task`
- `get_orchestration_result`
- `inspect_subagent_session`

Important plugin-path rules:

- `start_agent_task` requires explicit `intent`: `proposal` or `implementation`
- `memory_context.session.operator.tasks[]` now tracks `intent` as well as task status
- a running delegated `implementation` task blocks continuity-style preflight on the plugin path
- `get_orchestration_result` updates tracked task state when it sees a terminal workflow result

Current tracked task outcomes on the plugin path:

- `running` -> still delegated and in progress
- `completed` workflow result -> plugin task becomes `awaiting_verification`
- `failed | timed_out | step_failed | runner_failed` workflow result -> plugin task becomes `needs_attention`

Do not assume a richer finalize tool exists on the plugin path unless the runtime explicitly exposes it.

### MCP-capable path

On a source checkout or standalone server path, the broader MCP orchestration surface can also exist.

Use `runtime_capabilities` on the plugin path, or inspect the tool list directly, before assuming those tools are present.

## Plugin operator loop

The shipped plugin operator loop is intentionally small.

- `start_agent_task` creates a tracked task in the current session
- if `session.promptAsync` exists, the plugin can inject visible `Task — ...` start and terminal messages into the session
- `get_orchestration_result` is the normal plugin-side resume/read path
- the plugin operator ledger is a session view over workflow truth, not a second result store

What the plugin path does **not** currently guarantee:

- full raw orchestration MCP tools inside the plugin hook surface
- a public plugin finalize tool for marking verification complete
- implicit task-shape inference from category alone

## `start_agent_task`

Use this on the plugin path when you want category-routed delegated work.

Current required shape:

```json
{
  "category": "visual-engineering",
  "prompt": "Implement the requested frontend change.",
  "intent": "implementation"
}
```

Notes:

- `intent` is now part of the control-plane contract, not just prompt wording
- choose `proposal` when the delegated task is only for direction, planning, or recommendations
- choose `implementation` when the delegated task is expected to own the code change

## `get_orchestration_result`

Use this to read the latest stored workflow record.

On the plugin path it also keeps the tracked task ledger in sync:

- healthy `running` stays `running`
- terminal success-like completion becomes `awaiting_verification`
- terminal failure-like completion becomes `needs_attention`

## `memory_context`

Use this to inspect the plugin-side session state.

For orchestration debugging, inspect:

- `session.operator.orchModeEnabled`
- `session.operator.tasks[]`
- each task’s `intent`
- each task’s `status`

If a delegated `implementation` task is still `running`, continuity-style preflight suppression on the plugin path is expected.

## Wider MCP orchestration surface

When the broader MCP path is actually available, this repo can also expose tools such as:

- `orchestrate_workflow`
- `call_worker`
- `supervise_orchestration_result`
- `get_orchestration_supervision_result`
- `wait_for_orchestration_result`
- `list_orchestration_traces`

Those belong to the standalone/MCP-capable runtime story, not to the guaranteed plugin hook surface.

## Practical safety reminders

- Treat `running` as healthy in-progress state.
- Do not fall back to local execution just because async work is still running.
- On the plugin path, treat `intent` as mandatory truth for task shape.
- Use `memory_context` before guessing what the plugin operator loop thinks is happening.
