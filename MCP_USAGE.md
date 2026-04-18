# MCP Usage

Use this file when you need to understand the practical MCP/runtime surface for this repo.

`README.md` remains the human-facing package reference. `ORCHESTRATION.md` remains the orchestrator posture and routing policy. This file is the AI-facing guide for what runtime surfaces exist, when they exist, and how to use them safely.

## Runtime modes

There are two important runtime shapes in this repo.

### 1. Standard plugin install

When OpenCode loads the published plugin by package name, the guaranteed surface is the plugin-native memory backend:

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

Treat this as the default assumption unless you have evidence that the standalone MCP server was also injected.

`runtime_capabilities` is the plugin-side way to read that evidence explicitly. On the package/plugin path it reports `mode: "plugin-native"`; on a source checkout where the plugin injected the standalone MCP server it reports `mode: "plugin-native+mcp"` and lists the advertised orchestration tools.

### 2. Source checkout or standalone MCP path

When OpenCode loads this repo from a real source checkout, the plugin can also inject the standalone MCP server config. That path exposes the MCP-backed orchestration and worker tools.

If the host is using the standalone server directly (`bun run start`, `bun run dev`, or explicit MCP config), the same MCP tool names are available there too.

## Mode split: plugin-native vs MCP-backed

Use the plugin-native memory surface first for memory work. Do not assume orchestration tools exist just because the repo supports them.

- **Plugin-native memory work**: use the memory tools above
- **MCP orchestration / worker work**: use only when the host/runtime actually exposes those tools

If the current tool list contains `orchestrate_workflow`, `start_agent_task`, `get_orchestration_result`, `supervise_orchestration_result`, or `wait_for_orchestration_result`, you are on an MCP-capable path.

If you want a structured answer instead of inferring from the tool list, call `runtime_capabilities` on the plugin path.

## Plugin-local façade config

The OpenCode plugin path now supports a small plugin-local façade layer for category routing, reminder gating, and a thin operator loop for session-scoped orchestration continuity.

- `runtime.remindersEnabled`: enables the plugin-side async reminder contract when the host/plugin layer actually owns a session-visible reminder surface
- `routing.categories.<category>.model`: overrides the default model used by the local category façade
- `routing.categories.<category>.workerRuntime`: overrides the runtime selection (`shell` or `mcp`) used by the local category façade

Important posture:

- this is a **plugin-local control-plane layer**, not a second orchestration engine
- these settings do **not** imply orchestration is available on the standard plugin path; continue to gate on `runtime_capabilities`
- categories compile down to the repo’s existing worker/runtime/model choices rather than replacing the current workflow/result/supervision primitives

### Plugin-local operator loop

When the plugin path has orchestration plus reminders available, the plugin now keeps a small session-scoped operator state alongside the existing cached memory state.

- `memory_context` can include an `operator` section showing sticky orch mode plus the current per-session task ledger
- `orch: on`, `orch: off`, and `orch: status` are now session-scoped plugin behavior toggles rather than docs-only draft language
- `start_agent_task` starts a tracked session task when orch mode is active and now returns both `requestId` and `taskId`
- terminal async reminders can carry `requestId`, `taskId`, and a reminder token back to the main session-visible reminder surface
- `get_orchestration_result` moves tracked completed tasks into an `awaiting_verification` operator state
- `mark_orchestration_task_verification` is the plugin-local finalize step for closing a tracked task as `completed` or `needs_attention`

Current delivery posture:

- when the plugin client exposes `session.promptAsync`, the plugin treats that as a usable session-visible continuation surface
- `sessionVisibleRemindersAvailable` therefore means “the plugin can inject reminder continuations back into the active session,” not only “the host has a separate native reminder UI”
- `sessionTaskFlowAvailable` means the plugin can inject a visible `Task — ...` start message into the active session when `orch:` auto-dispatch begins and MCP orchestration is actually available on that runtime
- `tui.showToast` is optional best-effort acknowledgement only; reminder continuation delivery depends on `session.promptAsync`

Important posture:

- this operator state is **session-local control-plane state**, not a replacement for the workflow result store
- workflow truth still lives in the orchestration result/supervision stores; the operator ledger is a session view over that truth
- if reminders are unavailable or orch mode is off, the plugin must degrade cleanly to the older start/poll flow without pretending the closed loop exists

Example plugin-local façade config:

```jsonc
{
  "runtime": {
    "remindersEnabled": true
  },
  "routing": {
    "categories": {
      "quick": {
        "model": "claude-opus-4-7-high",
        "workerRuntime": "mcp"
      }
    }
  }
}
```

## Memory-side task flows

### Retrieval and turn prep

Use these for building context:

- `search_memories`
- `build_context_for_task`
- `wake_up_memory`
- `prepare_host_turn_memory`
- `prepare_turn_memory`
- `memory_context`

Recommended default:

- use `prepare_host_turn_memory` / `prepare_turn_memory` when you want retrieval context plus memory suggestions and conservative policy in one pass
- use `wake_up_memory` for broader session/profile wake-up context
- use `build_context_for_task` when you need retrieval without the higher-level host wrapper
- use `memory_context` when you want the plugin's cached session-start wake-up, turn precompute, idle persistence, startup brief, and capability snapshot for the active OpenCode session

### Diagnostics and audit

Use these when you want to understand what the plugin/runtime already knows:

- `memory_context`
- `runtime_capabilities`
- `inspect_memory_retrieval`

Recommended posture:

- use `runtime_capabilities` to determine whether orchestration should be advertised at all
- use `memory_context` to inspect cached session memory state, including the startup brief and capability snapshot on the plugin path
- use `inspect_memory_retrieval` when you need to answer why memory hit, missed, or degraded for the latest retrieval or for a known `requestId`

### Writing and persistence

Use these when you want to store or review durable memory:

- `remember`
- `upsert_document`
- `suggest_memory_candidates`
- `apply_conservative_memory_policy`

Recommended conservative write flow:

1. build or retrieve context first if needed
2. call `suggest_memory_candidates` or use the suggestion snapshot from `prepare_host_turn_memory`
3. call `apply_conservative_memory_policy` when you want conservative auto-save behavior
4. use `remember` or `upsert_document` explicitly when you already know exactly what should be stored

## MCP orchestration entrypoints

When the MCP orchestration surface is available, these are the primary tools:

- `start_agent_task`
- `call_worker`
- `orchestrate_workflow`
- `get_orchestration_result`
- `supervise_orchestration_result`
- `get_orchestration_supervision_result`
- `wait_for_orchestration_result`
- `list_orchestration_traces`

### `start_agent_task`

Use this when you want the thin OMOA-style public façade instead of constructing a raw workflow spec yourself.

Important posture:

- it accepts task intent through `category` plus a `prompt`
- it compiles to a one-job workflow using the repo’s existing worker/runtime/model routing rules
- it returns the same async contract as background workflow starts (`requestId`, `taskId`, `status`, `pollWith`, `recommendedFollowUp`, `nextArgs`, etc.)
- on the plugin path, this is part of the intentionally narrowed orchestration façade; the plugin does **not** expose the full raw orchestration surface

Example shape:

```json
{
  "category": "quick",
  "prompt": "Review this diff for obvious regressions.",
  "model": "claude-opus-4-7-high",
  "workerRuntime": "mcp",
  "mode": "plan"
}
```

### `call_worker`

Use this when you want a thin async direct-invoke surface on an explicit worker lane instead of category routing.

Important posture:

- it accepts `worker: "gemini" | "cursor"` plus a `prompt`
- it keeps the same async workflow polling contract as the other orchestration start surfaces
- it is the closest repo-owned analogue to a direct subagent/worker invoke surface, but centered on worker lanes instead of named OMO agents
- `model` is an optional override; if omitted, the repo uses the lane default (`gemini-3-pro-preview` for Gemini, `composer-2` for Cursor)
- humans usually do not need to manage lane-specific internal args themselves; the agent should compose worker-compatible input automatically
- if a caller still sends incompatible lane-only fields, `call_worker` strips them and returns a warning instead of failing the whole request
- if a caller explicitly requested a runtime (`workerRuntime`), the agent should not silently retry on another runtime unless fallback was also explicitly requested

### `orchestrate_workflow`

Use this for multi-job or multi-step workflows, mixed Gemini/Cursor execution, traceable runs, or when you want one request ID for a whole workflow-shaped batch. Do not default to this for a single worker job when the direct async worker tools are enough.

Important posture:

- prefer `waitForCompletion: false` for long-running workflows
- if `waitForCompletion` is omitted, the tool may auto-start in background and return async guidance
- production default: hand the returned `requestId` to `supervise_orchestration_result`, or to a background poller that calls `get_orchestration_result`
- `waitForCompletion: true` is no longer supported; orchestration starts are async-only

### `get_orchestration_result`

Use this when you want a non-blocking status read of the latest stored workflow record.

This is the primary low-level production follow-up for async orchestration because the workflow keeps running independently in the result store even if the original MCP request ends.

On the plugin path, this is also the resume step that advances a tracked session task from reminder-driven `awaiting_resume` into `awaiting_verification` when the workflow itself completed successfully.

### `mark_orchestration_task_verification`

Use this only on the plugin path when you want to finalize the session-local operator ledger after external verification already happened.

Important posture:

- this is a plugin-local control-plane tool, not an MCP orchestration engine tool
- it mutates only the session task ledger exposed through `memory_context`
- it does **not** rewrite workflow result-store records
- valid outcomes are `completed` and `needs_attention`

### `supervise_orchestration_result`

Use this when you want the repo to start a detached supervision loop for a `workflow_*` request and return immediately with a `supervisor_*` request ID.

It is the preferred production convenience path for background-first hosts because it avoids holding one MCP request open for the full supervision duration.

### `get_orchestration_supervision_result`

Use this when you want to poll the latest stored supervisor result by `supervisor_*` request ID.

It returns the background supervision state, not the raw workflow record.

### `wait_for_orchestration_result`

Use this when the host wants to block until a workflow reaches a terminal state.

Treat it as a short-wait or debug helper, not the primary production path. It still depends on the current MCP request staying alive long enough for the workflow to finish. Do not treat a bounded wait timeout as proof that the workflow failed, and do not fall back to sync/local execution just because the workflow is still `running`.

### `list_orchestration_traces`

Use this for execution forensics, trace inspection, and historical workflow debugging.

## Async orchestration pattern

Recommended pattern for long-running MCP orchestration:

1. call `orchestrate_workflow(..., waitForCompletion: false)`
2. capture the returned `requestId`
3. hand that `requestId` to `supervise_orchestration_result` to start repo-owned supervision, or to a background poller that calls `get_orchestration_result` until terminal
4. use `wait_for_orchestration_result` only when you explicitly need a short blocking read on a host that can safely keep the request open
5. once terminal, inspect the final result and verify externally as needed

Typical async start response includes:

- `requestId`
- `status: "running"`
- `executionMode: "async"`
- `waitMode`
- `pollWith: "get_orchestration_result"`
- `superviseWith: "supervise_orchestration_result"`
- `superviseResultWith: "get_orchestration_supervision_result"`
- `waitWith: "wait_for_orchestration_result"`
- `recommendedFollowUp: "supervise_orchestration_result"`
- `warning`
- `nextArgs`

That `status: "running"` response is the healthy default for background-first MCP orchestration. It means the workflow is still progressing in the stored result path, not that it went stale or failed. Keep polling the same `requestId` or start supervision; do not switch to `waitForCompletion: true`, sync worker tools, or local CLI execution for the same task while that request is still `running`.

## Direct worker tools

When the direct worker MCP tools are available, use the async pair only:

- `run_gemini_worker_async`
- `get_gemini_worker_result`
- `run_cursor_worker_async`
- `get_cursor_worker_result`

Use these when you want one worker job without the heavier orchestration envelope. This should be the default for a single Gemini or Cursor worker job.

Recommended posture:

- use the async start tool for long-running direct worker calls
- keep the returned `requestId`
- poll the matching `get_*_result` tool until terminal
- treat `running` as healthy in-progress state and keep polling rather than switching to the sync worker tool
- do not fall back to local CLI execution for the same task while the async worker request is still `running`
- prefer this path over `orchestrate_workflow` when you only need one worker job

## Choosing between orchestration and direct worker tools

Use `orchestrate_workflow` when:

- you need multiple jobs or steps
- you need workflow-level traces
- you need mixed worker kinds
- you need one request ID for the whole batch

Use direct async worker tools when:

- you only need one worker job
- you still want async behavior without keeping a single request open
- you want the simplest default path for a single Gemini or Cursor task

## Runtime selection

This repo supports shell-backed and MCP-backed worker execution depending on entrypoint and runtime selection.

- default worker execution remains **shell** when nothing selects MCP
- `MAHIRO_CURSOR_RUNTIME=mcp` and `MAHIRO_GEMINI_RUNTIME=mcp` opt into MCP-backed worker runtime selection where supported
- workflow jobs can also set `workerRuntime: "mcp"` explicitly when you want the MCP-backed worker runtime for that job

Do not assume every async or orchestration call is automatically using MCP-backed worker execution. Check the workflow metadata or trace/result store when it matters.

## Waiting, polling, and terminal state

Treat `running` as an in-progress stored state, not as a failure.

For long-running work:

- repeated `running` reads are a healthy in-progress signal, not proof of staleness or failure
- do not switch to sync just because the first read still shows `running`
- do not switch to sync/local CLI execution just because a bounded wait helper timed out while the stored workflow still shows `running`
- prefer `supervise_orchestration_result` plus `get_orchestration_supervision_result`, or background polling with `get_orchestration_result`
- use `wait_for_orchestration_result` only when the host can safely hold a short MCP request open
- distinguish three timeouts: workflow runtime timeout (`spec.timeoutMs`), wait-helper local timeout (`wait_for_orchestration_result.timeoutMs`), and host/MCP request timeout outside this repo’s control

For single-worker jobs, prefer `run_gemini_worker_async` or `run_cursor_worker_async` instead of `orchestrate_workflow` unless you specifically need workflow-level traces or mixed-worker composition.

Terminal workflow states include completed and failure variants like `failed`, `step_failed`, `timed_out`, and `runner_failed`.

## Trace and result inspection

Use the result store and trace tools to answer questions like:

- did this workflow actually run in this repo?
- was the orchestration entrypoint called from MCP or CLI?
- what `workerRuntime` did the job use?
- did the workflow fail at the runner level or inside a worker job?

For memory retrieval diagnostics on the plugin/memory side, use `inspect_memory_retrieval` instead of reading trace files directly.

Use:

- `get_orchestration_result` for the default low-level latest-state path
- `supervise_orchestration_result` to start repo-owned detached supervision
- `get_orchestration_supervision_result` for the preferred concise supervision-result polling path
- `wait_for_orchestration_result` for short blocking reads only
- `list_orchestration_traces` for persisted trace history

## Practical safety reminders

- Do not present orchestration tools as guaranteed on the standard plugin path.
- Do not rely on agent-side sleep loops when the stored-state poll and wait tools already exist.
- Prefer background polling over blocking waits for long-running hosts.
- Prefer `supervise_orchestration_result` + `get_orchestration_supervision_result` when you want the repo to own the polling loop instead of the host.
- Do not treat worker output as final truth without verification.
- Prefer the smallest surface that matches the task: memory tool, direct async worker, or full orchestration.
