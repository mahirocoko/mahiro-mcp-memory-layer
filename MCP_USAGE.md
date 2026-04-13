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
- `memory_context`

Treat this as the default assumption unless you have evidence that the standalone MCP server was also injected.

### 2. Source checkout or standalone MCP path

When OpenCode loads this repo from a real source checkout, the plugin can also inject the standalone MCP server config. That path exposes the MCP-backed orchestration and worker tools.

If the host is using the standalone server directly (`bun run start`, `bun run dev`, or explicit MCP config), the same MCP tool names are available there too.

## Mode split: plugin-native vs MCP-backed

Use the plugin-native memory surface first for memory work. Do not assume orchestration tools exist just because the repo supports them.

- **Plugin-native memory work**: use the memory tools above
- **MCP orchestration / worker work**: use only when the host/runtime actually exposes those tools

If the current tool list contains `orchestrate_workflow`, `get_orchestration_result`, or `wait_for_orchestration_result`, you are on an MCP-capable path.

## Memory-side task flows

### Retrieval and turn prep

Use these for building context:

- `search_memories`
- `build_context_for_task`
- `wake_up_memory`
- `prepare_host_turn_memory`
- `prepare_turn_memory`

Recommended default:

- use `prepare_host_turn_memory` / `prepare_turn_memory` when you want retrieval context plus memory suggestions and conservative policy in one pass
- use `wake_up_memory` for broader session/profile wake-up context
- use `build_context_for_task` when you need retrieval without the higher-level host wrapper

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

- `orchestrate_workflow`
- `get_orchestration_result`
- `supervise_orchestration_result`
- `wait_for_orchestration_result`
- `list_orchestration_traces`

### `orchestrate_workflow`

Use this for multi-job or multi-step workflows, mixed Gemini/Cursor execution, traceable runs, or when you want a single workflow request ID.

Important posture:

- prefer `waitForCompletion: false` for long-running workflows
- if `waitForCompletion` is omitted, the tool may auto-start in background and return async guidance
- production default: hand the returned `requestId` to a background poller that calls `get_orchestration_result`
- synchronous waiting is intentionally narrow and only valid for trivial Gemini-only cases

### `get_orchestration_result`

Use this when you want a non-blocking status read of the latest stored workflow record.

This is the primary production follow-up for async orchestration because the workflow keeps running independently in the result store even if the original MCP request ends.

### `supervise_orchestration_result`

Use this when you want a built-in supervisor helper that polls until terminal and returns a concise final summary instead of the full workflow record.

It is the preferred convenience path for background-first hosts that still want one final MCP response per `requestId`.

### `wait_for_orchestration_result`

Use this when the host wants to block until a workflow reaches a terminal state.

Treat it as a short-wait or debug helper, not the primary production path. It still depends on the current MCP request staying alive long enough for the workflow to finish.

### `list_orchestration_traces`

Use this for execution forensics, trace inspection, and historical workflow debugging.

## Async orchestration pattern

Recommended pattern for long-running MCP orchestration:

1. call `orchestrate_workflow(..., waitForCompletion: false)`
2. capture the returned `requestId`
3. hand that `requestId` to `supervise_orchestration_result`, or to a background poller that calls `get_orchestration_result` until terminal
4. use `wait_for_orchestration_result` only when you explicitly need a short blocking read on a host that can safely keep the request open
5. once terminal, inspect the final result and verify externally as needed

Typical async start response includes:

- `requestId`
- `status: "running"`
- `executionMode: "async"`
- `waitMode`
- `pollWith: "get_orchestration_result"`
- `superviseWith: "supervise_orchestration_result"`
- `waitWith: "wait_for_orchestration_result"`
- `recommendedFollowUp: "get_orchestration_result"`
- `warning`
- `nextArgs`

## Direct worker tools

When the direct worker MCP tools are available, they split into sync and async pairs.

### Sync tools

- `run_gemini_worker`
- `run_cursor_worker`

Use these only for short direct calls where holding the MCP request open is acceptable.

### Async tools

- `run_gemini_worker_async`
- `get_gemini_worker_result`
- `run_cursor_worker_async`
- `get_cursor_worker_result`

Use these when you want one worker job without the heavier orchestration envelope.

Recommended posture:

- use the async start tool for long-running direct worker calls
- keep the returned `requestId`
- poll the matching `get_*_result` tool until terminal

## Choosing between orchestration and direct worker tools

Use `orchestrate_workflow` when:

- you need multiple jobs or steps
- you need workflow-level traces
- you need mixed worker kinds
- you need one request ID for the whole batch

Use direct async worker tools when:

- you only need one worker job
- you still want async behavior without keeping a single request open

Use sync worker tools only when:

- the task is short enough that a single blocking call is acceptable

## Runtime selection

This repo supports shell-backed and MCP-backed worker execution depending on entrypoint and runtime selection.

- default worker execution remains **shell** when nothing selects MCP
- `MAHIRO_CURSOR_RUNTIME=mcp` and `MAHIRO_GEMINI_RUNTIME=mcp` opt into MCP-backed worker runtime selection where supported
- workflow jobs can also set `workerRuntime: "mcp"` explicitly when you want the MCP-backed worker runtime for that job

Do not assume every async or orchestration call is automatically using MCP-backed worker execution. Check the workflow metadata or trace/result store when it matters.

## Waiting, polling, and terminal state

Treat `running` as an in-progress stored state, not as a failure.

For long-running work:

- do not switch to sync just because the first read still shows `running`
- prefer `supervise_orchestration_result` or background polling with `get_orchestration_result`
- use `wait_for_orchestration_result` only when the host can safely hold a short MCP request open
- distinguish three timeouts: workflow runtime timeout (`spec.timeoutMs`), wait-helper local timeout (`wait_for_orchestration_result.timeoutMs`), and host/MCP request timeout outside this repo’s control

Terminal workflow states include completed and failure variants like `failed`, `step_failed`, `timed_out`, and `runner_failed`.

## Trace and result inspection

Use the result store and trace tools to answer questions like:

- did this workflow actually run in this repo?
- was the orchestration entrypoint called from MCP or CLI?
- what `workerRuntime` did the job use?
- did the workflow fail at the runner level or inside a worker job?

Use:

- `get_orchestration_result` for the default latest-state path
- `supervise_orchestration_result` for a concise terminal summary helper
- `wait_for_orchestration_result` for short blocking reads only
- `list_orchestration_traces` for persisted trace history

## Practical safety reminders

- Do not present orchestration tools as guaranteed on the standard plugin path.
- Do not rely on agent-side sleep loops when the stored-state poll and wait tools already exist.
- Prefer background polling over blocking waits for long-running hosts.
- Prefer `supervise_orchestration_result` when you want the repo to own the polling loop instead of the host.
- Do not treat worker output as final truth without verification.
- Prefer the smallest surface that matches the task: memory tool, direct async worker, or full orchestration.
