# Mahiro MCP Memory Layer

Local-first MCP memory layer prototype with:

- append-only canonical JSONL log
- LanceDB-backed retrieval table
- deterministic local embeddings for v0
- MCP tools and resources built on a thin server layer

## OpenCode plugin install

Standard path:

1. Add the package name to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["mahiro-mcp-memory-layer"]
}
```

OpenCode installs npm plugins with Bun at startup, so this is the only step for the normal plugin path.

With that plugin-only install, OpenCode gets the native memory tool surface directly from the in-process shared backend — no separate `mcp` block is required for `remember`, `search_memories`, `build_context_for_task`, `upsert_document`, `list_memories`, `suggest_memory_candidates`, `apply_conservative_memory_policy`, `prepare_host_turn_memory`, `prepare_turn_memory`, `wake_up_memory`, `inspect_memory_retrieval`, or the plugin-only diagnostic tools `memory_context` and `runtime_capabilities`.

The plugin's session-start memory bootstrap now tolerates live OpenCode runs that emit generic message events before a dedicated `session.created` hook. In practice, that means wake-up can start from the first session-scoped generic event as a fallback, so `memory_context` still gets a cached `wakeUp` payload even when `opencode run` does not surface `session.created` early enough for the plugin.

That cached wake-up payload now includes a compact startup brief that advertises the current runtime mode. On the standard plugin path it says memory-only; on the source-checkout path it also advertises the injected standalone MCP orchestration path. The same mode split is also available as structured JSON from `runtime_capabilities`.

The plugin also appends the packaged `MCP_USAGE.md` and `ORCHESTRATION.md` files to OpenCode's `instructions` config automatically, so the standard package/plugin path does not require a manual `instructions` entry in `opencode.json`.

Local development path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer"]
}
```

Use the `file://` variant when you want OpenCode to load the plugin directly from your local checkout while debugging or iterating on the source.

When the plugin is loaded from a real source checkout like the `file://` path above, it also injects a local MCP entry for this repo's standalone server through the plugin `config` hook. That makes MCP-backed orchestration available without adding a manual `mcp` block yourself.

On the **plugin hook path itself**, the exposed orchestration surface stays intentionally thin:

- `start_agent_task`
- `get_orchestration_result`
- `supervise_orchestration_result`
- `get_orchestration_supervision_result`

This keeps the plugin path aligned with the new façade model instead of exposing the full raw orchestration tool set inside the interactive plugin UI.

That MCP injection is intentionally source-checkout only. The standard package-name install should be treated as the plugin-native memory path first.

Plugin override path:

- user config: `~/.config/opencode/mahiro-mcp-memory-layer.jsonc`
- project config: `.opencode/mahiro-mcp-memory-layer.jsonc`
- environment override: `MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS`

Example plugin config:

```jsonc
{
  "runtime": {
    "messageDebounceMs": 150,
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

Precedence is: environment override > project plugin config > user plugin config > built-in defaults.

Manual MCP fallback:

- If you want the standalone MCP server, keep using the existing repo scripts: `bun run start` or `bun run dev`.
- That path preserves the current MCP tool names and behavior as a fallback, but it is separate from the standard plugin-only install and from the published plugin package root.

## Commands

```bash
bun install
bun run dev
agent -p --model composer-2 --output-format json "Review this diff"
bun run gemini -- --model gemini-3-flash-preview "Summarize this repo"
echo '{"mode":"parallel","jobs":[{"kind":"gemini","input":{"prompt":"Summarize this repo","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Review this diff","model":"composer-2"}}]}' | bun run orchestrate -- --file -
echo '{"taskId":"task-1","prompt":"Summarize this repo","model":"gemini-3-flash-preview"}' | bun run gemini-worker
bun run typecheck
bun run test
bun run reindex
```

## Docs map

- `README.md` — package overview, install, and command/reference material
- `MCP_USAGE.md` — practical MCP/runtime guide, tool surface, async waiting, and trace/result flows
- `ORCHESTRATION.md` — orchestrator posture, routing, delegation, and verification rules
- `AGENTS.md` — thin entrypoint that points agents to the right narrower doc

## Memory tools

OpenCode plugin users now get the same memory tool names natively from the shared in-process backend, plus the plugin-only diagnostic tools `memory_context` for cached session state and `runtime_capabilities` for the current runtime capability contract.

The memory side now has two distinct loops:

- read loop: `search_memories`, `build_context_for_task`, and product wrappers `wake_up_memory` / `prepare_turn_memory`
- write loop: `remember`, `upsert_document`, `suggest_memory_candidates`, and `apply_conservative_memory_policy`
- audit loop: `inspect_memory_retrieval`, `memory_context`, and `runtime_capabilities`

Plugin override knob:

- `MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS` controls the OpenCode plugin's message debounce window.
- `MAHIRO_OPENCODE_PLUGIN_REMINDERS_ENABLED=true|false` overrides the plugin-local async reminder gate.
- `MAHIRO_OPENCODE_PLUGIN_DEBUG_STDERR=1` mirrors plugin lifecycle logging to stderr when the OpenCode app logger is unavailable or failing, which is useful for debugging live hook delivery and wake-up caching.

### Thin async façade

When the MCP orchestration surface is available, `start_agent_task` is now the smallest public category-driven async start surface.

- it accepts a task `category` and `prompt`
- it compiles that category to the repo’s existing worker/runtime/model routing
- it returns the same async polling contract as workflow starts (`requestId`, `status`, `pollWith`, `recommendedFollowUp`, etc.)
- it does **not** create a second orchestration engine or a second persistence lifecycle

Use it when you want OMOA-style category routing without constructing raw workflow specs yourself.

**Host one-call:** `prepare_host_turn_memory` — same inputs as `build_context_for_task` except `includeMemorySuggestions` is implicit (always on): provide `task`, `mode`, `recentConversation`, and your scope ids (`userId`, `projectId`, `containerId`, `sessionId` as needed). Returns the built context bundle, `memorySuggestions`, and `conservativePolicy` (policy reuses that suggestion snapshot so heuristics run once). Optional `sourceOverride` / `extraTags` apply to auto-saved memories under `strong_candidate`, same as `apply_conservative_memory_policy`. **`prepare_turn_memory`** is an alias with the same inputs and behavior.

**Wake-up:** `wake_up_memory` — same scope + optional `maxItems` / `maxChars` as `build_context_for_task`, but runs two internal retrieval passes (`profile` and `recent` modes) and returns `wakeUpContext` (combined) plus `profile` and `recent` section objects (each matches one `build_context_for_task` result). No suggestions or policy.

On the OpenCode plugin path, the cached wake-up context exposed through `memory_context` also prepends a small runtime startup brief so fresh sessions can tell whether they are on the plugin-native memory-only path or on a source-checkout path with injected MCP orchestration.

**Retrieval audit:** `inspect_memory_retrieval` — read the latest retrieval trace or inspect one by `requestId`. This is the smallest public hit/miss audit surface: it returns the stored retrieval trace plus a compact summary (`hit`, `returnedCount`, `degraded`) without introducing a second trace model.

**Runtime capability contract:** `runtime_capabilities` — plugin-only read-only surface that reports whether the current OpenCode session is on the standard plugin-native path or on a source-checkout path where the standalone MCP server was injected. Use this instead of guessing whether orchestration tools should be available.

Recommended conservative write flow:

- **Retrieval context + policy in one call:** use `prepare_host_turn_memory` (see Host one-call above). It returns `memorySuggestions` and `conservativePolicy` from the same heuristic snapshot.

**Policy without building retrieval context** (for example you already have a `suggestion` object):

1. Call `apply_conservative_memory_policy` with the same scope identifiers you use elsewhere (`userId`, `projectId`, `containerId`, `sessionId` as required by each candidate’s `scope`) plus `conversation`, **or** pass a precomputed `suggestion` object from `suggest_memory_candidates` / `build_context_for_task.memorySuggestions`.
2. Policy behavior:
   - `strong_candidate` → auto-`remember` each candidate **only when** scope identifiers are complete for that candidate’s `scope` (incomplete rows appear in `autoSaveSkipped`).
   - `consider_saving` → **no** writes; inspect `reviewOnlySuggestions` (same as `candidates`).
   - `likely_skip` → no writes; `autoSaved` and `reviewOnlySuggestions` are empty.

Manual / advanced flow:

1. Call `suggest_memory_candidates` on the recent conversation or notes.
2. If the result says `strong_candidate` or `consider_saving`, inspect the returned candidates.
3. Persist the chosen candidate with `remember` (or use `apply_conservative_memory_policy` to apply the policy above).
4. Use `upsert_document` instead when the memory is document-shaped and should be idempotent by source identity.

`build_context_for_task` can also help with this in one round-trip:

- set `includeMemorySuggestions: true`
- pass `recentConversation`
- the result includes `memorySuggestions` next to the built context bundle
- this still does not write storage automatically; pass that object to `apply_conservative_memory_policy` as `suggestion` if you want the conservative policy applied in a follow-up call

### suggest_memory_candidates

Use this tool when an agent needs help deciding whether a conversation contains durable memory worth saving.

- deterministic heuristic extraction only; it does not write storage
- returns a top-level `recommendation`
- returns `signals` for durable vs ephemeral language
- returns candidate memories with suggested `kind`, `scope`, `reason`, `draftContent`, and `confidence`

Input shape:

```json
{
  "conversation": "We decided to use Bun for runtime scripts from now on.",
  "userId": "mahiro",
  "projectId": "mahiro-mcp-memory-layer",
  "containerId": "workspace:mahiro-mcp-memory-layer",
  "sessionId": "session-123",
  "maxCandidates": 3
}
```

Result shape includes:

- `recommendation`: `likely_skip` | `consider_saving` | `strong_candidate`
- `signals.durable`
- `signals.ephemeral`
- `candidates[]`

Example flow:

```json
{
  "recommendation": "strong_candidate",
  "signals": {
    "durable": ["explicit_durable_language"],
    "ephemeral": []
  },
  "candidates": [
    {
      "kind": "decision",
      "scope": "project",
      "reason": "Explicit decision language (decided/agreed/chose).",
      "draftContent": "We decided to use Bun for runtime scripts from now on.",
      "confidence": "high"
    }
  ]
}
```

### apply_conservative_memory_policy

Single entrypoint for hosts that want the **conservative** policy without implementing their own branching:

- Runs the same heuristics as `suggest_memory_candidates` when `conversation` is provided and `suggestion` is omitted.
- If `suggestion` is set, heuristics are skipped and that snapshot is used (for example, reuse `memorySuggestions` from `build_context_for_task`).

Input (JSON shape; all fields optional except you must supply **`conversation`** or **`suggestion`**):

- `conversation`, `userId`, `projectId`, `containerId`, `sessionId`, `maxCandidates` — same meaning as `suggest_memory_candidates`.
- `suggestion` — optional full `suggest_memory_candidates` result object.
- `sourceOverride` — optional `source` for auto-saved memories (default: `{ "type": "tool", "title": "apply_conservative_memory_policy" }`).
- `extraTags` — optional extra tags appended on auto-saves (always includes `conservative_auto_save`).

Result:

- `recommendation`, `signals`, `candidates` — same as `suggest_memory_candidates` (full transparency).
- `autoSaved` — `{ candidateIndex, id }[]` for memories written under `strong_candidate`.
- `autoSaveSkipped` — candidates not written because scope ids were incomplete (`reason: "incomplete_scope_ids"`).
- `reviewOnlySuggestions` — populated only for `consider_saving` (no auto-save).

## Operator Shortcut

For strict orchestrator behavior and routing posture, use `ORCHESTRATION.md`. For concrete MCP payloads and async waiting flows, use `MCP_USAGE.md`.

Use `orch:` at the start of a request when you want strict orchestrator behavior.

- `orch:` means classify first, choose the worker/model explicitly, and delegate before local code work.
- In `orch:` mode, local implementation is restricted to the narrow escape hatch in `ORCHESTRATION.md`.
- Verification, synthesis, and final judgment still stay with the orchestrator.

Example:

```text
orch: review this diff with Opus, then verify with tests and build
```

## Cursor wrapper

The native headless Cursor-family entrypoint in this repo is `agent -p --output-format json ...`.

`bun run cursor` is a repo-local wrapper around that `agent` command. Use it when you want this package's normalized JSON envelope and defaults, but do not confuse it with the native headless command itself.

`AGENTS.md` is the thin repo instruction entrypoint for AI agents in this repo. `MCP_USAGE.md` owns practical MCP/runtime guidance, and `ORCHESTRATION.md` extends the agent posture with orchestration-specific policy.

`README.md` is the canonical command/reference document for this package. `AGENTS.md` stays lean, `MCP_USAGE.md` owns MCP/runtime usage guidance, and `ORCHESTRATION.md` owns worker-selection posture and orchestration behavior.

Trust behavior:

- current workspace paths are trusted by default for Cursor-family runs
- nested paths under the current workspace are also trusted by default
- unrelated workspaces stay untrusted unless you opt in explicitly
- use `--trust` to force trust on
- use `--no-trust` to force trust off
- set `CURSOR_TRUSTED_WORKSPACES` to a path-delimited list of extra trusted roots

Model selection:

- `--model` is required on every invocation
- `composer-2` -> default doer for standard implementation and review
- `claude-opus-4-7-high` -> hard escalation for planning, architecture, and high-risk validation
- `claude-opus-4-7-thinking-high` -> deep-reasoning escalation when deliberate thinking quality matters more than speed
- `claude-4.6-sonnet-medium` and `claude-4.6-opus-*` -> fallback-only compatibility lanes
- if the caller explicitly requests a model, use that exact model rather than silently downgrading
- `--mode plan` is optional and should be used only when the task is complex enough that you need an explicit planning pass

```bash
agent -p --model composer-2 --output-format json "Review this diff"
agent -p --model claude-opus-4-7-high --output-format json "Plan a deep cross-module refactor"
agent -p --model claude-opus-4-7-thinking-high --output-format json "Diagnose the architecture tradeoffs in this package"

# Repo-local wrapper around the same headless path
bun run cursor -- --model composer-2 "Review this diff"
bun run cursor -- --model composer-2 --no-trust "Review this external repo"
```

## Cursor worker

`cursor-worker` is the host-friendly stdin wrapper around the same `agent -p --output-format json` headless path.

- reads one JSON payload from stdin
- runs `agent -p --output-format json`
- writes one normalized JSON result to stdout

Input shape:

```json
{
  "taskId": "task-1",
  "prompt": "Review this diff",
  "model": "claude-opus-4-7-high",
  "mode": "plan",
  "force": false,
  "trust": true,
  "timeoutMs": 30000,
  "cwd": "/path/to/project"
}
```

Notes:

- omit `trust` to use the default workspace-based trust resolution above
- set `trust: true` or `trust: false` to override that default explicitly
- shell is still the default Cursor worker runtime
- set `MAHIRO_CURSOR_RUNTIME=mcp` to opt into the MCP-backed Cursor runtime prototype

Result shape includes:

- `status`
- `taskId`
- `requestedModel`
- `reportedModel`
- `response`
- `error`
- `exitCode`
- `startedAt`
- `finishedAt`
- `durationMs`

## Gemini command

`gemini` is the ergonomic assistant-facing command. It auto-generates a task ID, accepts the prompt directly from argv, and still prints the same normalized JSON envelope as the lower-level worker.

Model selection:

- `--model` is required on every invocation
- `gemini-3-flash-preview` -> lighter visual/exploration/extraction work
- `gemini-3-pro-preview` -> stronger visual/frontend/artistry work or harder Gemini reasoning
- `gemini-2.5-flash` / `gemini-2.5-pro` -> stable fallback lanes

Use Gemini when you intentionally want the Gemini family for:

- visual/frontend execution
- visual-engineering and artistry
- extraction, timelines, or summarization
- alternate reasoning alongside Cursor-family workers

Task routing:

- `--task general` -> plain Gemini prompt passthrough
- `--task summarize` -> JSON summary + key points
- `--task timeline` -> JSON overview + timeline items
- `--task extract-facts` -> JSON summary + facts + warnings

CLI control flags:

- `--approval-mode <default|auto_edit|yolo|plan>` forwards Gemini CLI approval behavior directly
- `--allowed-mcp-server-names <name1,name2,...|none>` forwards a session MCP allowlist; this repo accepts `none` as a local convenience for zero MCP servers
- `--binary-path <path>` overrides which local `gemini` binary the wrapper spawns
- MCP server names must not contain commas, and `none` cannot be mixed with named servers

Caching:

- completed Gemini results are cached locally by routed prompt + task kind + model + cwd
- repeated equivalent calls can return `cached: true` without a fresh Gemini request
- cache entries expire after 24 hours by default
- cache version mismatches invalidate old entries automatically

```bash
bun run gemini -- --model gemini-3-flash-preview "Summarize this repo"
bun run gemini -- --model gemini-3-pro-preview "Review this architecture and propose tradeoffs"
bun run gemini -- --model gemini-3-flash-preview --task summarize "Summarize the latest meeting notes"
bun run gemini -- --model gemini-3-flash-preview --task timeline "Summarize the project timeline from these notes"
bun run gemini -- --model gemini-3-pro-preview --timeout-ms 30000 --cwd /path/to/project "Review the current diff"
bun run gemini -- --model gemini-3-pro-preview --approval-mode plan --allowed-mcp-server-names none "Draft a grounded UI patch"
```

## Gemini worker

`gemini-worker` is a thin host-friendly wrapper around `gemini -m ... -p ... --output-format json`.

- reads one JSON payload from stdin
- runs Gemini in headless mode
- writes one normalized JSON result to stdout

Input shape:

```json
{
  "taskId": "task-1",
  "prompt": "Summarize this repo",
  "model": "gemini-3-flash-preview",
  "approvalMode": "plan",
  "allowedMcpServerNames": "none",
  "binaryPath": "/usr/local/bin/gemini",
  "taskKind": "summarize",
  "timeoutMs": 30000,
  "cwd": "/path/to/project"
}
```

`allowedMcpServerNames` accepts either:

- `"none"` as a repo-local convenience for zero MCP servers
- an array of server names such as `["docs", "repo-tools"]`

Server names must not contain commas, and the array form must not include `"none"`.

Result shape includes:

- `status`
- `taskId`
- `requestedModel`
- `reportedModel`
- `response`
- `structuredData`
- `cached`
- `error`
- `exitCode`
- `startedAt`
- `finishedAt`
- `durationMs`

Runtime selection:

- shell is still the default Gemini worker runtime
- set `MAHIRO_GEMINI_RUNTIME=mcp` to opt into the MCP-backed Gemini runtime prototype

## Parallel execution playbook

Run workers in parallel only when their inputs are fully independent — neither worker's output is needed to form the other's prompt.

This section documents the command shapes. `ORCHESTRATION.md` defines the orchestration posture for when to parallelize, when to sequence, and how to verify the result.

- **Safe:** Gemini designs one frontend surface while Cursor reviews an unrelated backend diff.
- **Safe:** Two Gemini jobs analyze separate visual/frontend areas in parallel.
- **Safe:** Five Cursor jobs review five unrelated files/modules in parallel.
- **Unsafe:** Gemini extracts facts → you use those facts to write the Cursor prompt.

```bash
bun run gemini -- --model gemini-3-pro-preview --cwd /path/to/repo "Design the new frontend surface" &
agent -p --model composer-2 --output-format json "Review the unrelated backend diff" &
wait
```

## Orchestrate command

`orchestrate` is the package-level workflow runner for static JSON-defined parallel or sequential job specs.

This section is the canonical reference for CLI flags, workflow JSON fields, async MCP usage, and trace inspection examples. `AGENTS.md` and `ORCHESTRATION.md` cover the higher-level agent and worker protocol.

Flags:

- `--file <path>` -> workflow JSON file path, or `-` to read from stdin
- `--cwd <path>` -> optional default cwd applied to jobs that do not set their own `input.cwd`
- `--dry-run` -> validate the workflow spec and print the normalized execution plan without running workers

Result envelope includes:

- `requestId` when orchestration tracing is enabled
- `mode`
- `status`
- `results`
- `summary.totalJobs`
- `summary.finishedJobs`
- `summary.completedJobs`
- `summary.failedJobs`
- `summary.skippedJobs`
- `summary.startedAt`
- `summary.finishedAt`
- `summary.durationMs`

Dry-run result includes:

- `status: "dry_run"`
- `mode`
- `spec` with generated task IDs and normalized defaults
- `summary.totalJobs`
- `summary.maxConcurrency` / `summary.timeoutMs` when present

Trace artifact:

- orchestration runs append JSONL entries to `data/traces/orchestration-trace.jsonl`
- trace entries include workflow mode, status, job kinds, task IDs, summary counts, source (`cli` or `mcp`), and per-finished-job `jobModels` with `requestedModel` / optional `reportedModel` for Gemini and Cursor jobs (older lines may omit `jobModels`)

Result store vs trace store:

- `data/traces/orchestration-results/*.json` is the request-scoped result store used by `get_orchestration_result` and keeps the latest polling state for a single `requestId`
- result-store metadata now also persists per-job configured retry policy (`configuredRetries`, `configuredRetryDelayMs`) when present, alongside task IDs and explicit worker runtimes
- `data/traces/orchestration-trace.jsonl` is the append-only telemetry log used by `list_orchestration_traces` and usage summaries
- trace telemetry keeps both configured retry policy and terminal retry outcomes (`retryCount`) when current package versions write `jobModels`
- the stores stay separate on purpose: polling needs mutable latest-state records, while observability needs historical append-only entries for forensic inspection and aggregation

Parallel workflow fields:

- `maxConcurrency` -> optional positive integer limit for how many parallel jobs run at once
- `timeoutMs` -> optional workflow-level deadline in milliseconds; bounds started jobs and stops launching new ones after expiry
- `defaultTrust` -> optional default trust mode applied to Cursor jobs that do not set `input.trust`
- `workerRuntime` -> optional per-job execution backend: `shell` or `mcp`; overrides env-based runtime selection for that job
- per-job `retries` / `retryDelayMs` -> optional retry policy for transient worker failures with exponential backoff

Worker runtime (Cursor / Gemini):

- default remains **shell** (spawn the local `agent` / `gemini` CLIs in-process) when nothing selects MCP
- `MAHIRO_CURSOR_RUNTIME=mcp` and `MAHIRO_GEMINI_RUNTIME=mcp` opt into the MCP stdio client path for that worker family (out-of-process: connect to this server and call `run_cursor_worker` / `run_gemini_worker`)
- per-job `workerRuntime`: `shell` or `mcp` on `cursor` and `gemini` jobs (parallel) or steps (sequential); explicit job-level selection overrides the env for that job
- the MCP orchestration path preserves each workflow job's requested `workerRuntime`; omit it to keep the default shell worker behavior, or set `workerRuntime: "mcp"` explicitly when you want the MCP-backed worker runtime

Parallel example:

```bash
echo '{"mode":"parallel","jobs":[{"kind":"gemini","input":{"prompt":"Summarize this repo","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Review this diff","model":"composer-2"}}]}' | bun run orchestrate -- --file -
```

Parallel trust-default example:

```bash
echo '{"mode":"parallel","defaultTrust":false,"jobs":[{"kind":"cursor","input":{"prompt":"Review this external repo","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review this local repo","model":"composer-2","trust":true}}]}' | bun run orchestrate -- --file -
```

Parallel runtime-selection example:

```bash
echo '{"mode":"parallel","jobs":[{"kind":"gemini","workerRuntime":"mcp","input":{"prompt":"Summarize this repo","model":"gemini-3-flash-preview"}},{"kind":"cursor","workerRuntime":"shell","input":{"prompt":"Review this diff","model":"composer-2"}}]}' | bun run orchestrate -- --file -
```

Example result shape:

```json
{
  "requestId": "workflow_123",
  "mode": "parallel",
  "status": "completed",
  "results": [
    {
      "kind": "gemini",
      "input": {
        "taskId": "gemini_123",
        "prompt": "Summarize this repo.",
        "model": "gemini-3-flash-preview"
      },
      "result": {
        "status": "completed"
      }
    }
  ],
  "summary": {
    "totalJobs": 2,
    "finishedJobs": 2,
    "completedJobs": 2,
    "failedJobs": 0,
    "skippedJobs": 0,
    "startedAt": "2026-04-05T00:00:00.000Z",
    "finishedAt": "2026-04-05T00:00:01.000Z",
    "durationMs": 1000
  }
}
```

Larger fan-out example:

```bash
echo '{"mode":"parallel","jobs":[{"kind":"cursor","input":{"prompt":"Review module A","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module B","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module C","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module D","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module E","model":"composer-2"}}]}' | bun run orchestrate -- --file -
```

Concurrency-limited example:

```bash
echo '{"mode":"parallel","maxConcurrency":2,"jobs":[{"kind":"cursor","input":{"prompt":"Review module A","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module B","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module C","model":"composer-2"}},{"kind":"cursor","input":{"prompt":"Review module D","model":"composer-2"}}]}' | bun run orchestrate -- --file -
```

The orchestration layer is not limited to one Gemini plus one Cursor. It can fan out many independent jobs of the same or different worker kinds, subject to local machine capacity and upstream tool/runtime limits.

Timeout behavior:

- workflow `timeoutMs` is enforced across the whole orchestration run
- started jobs receive an effective timeout bounded by the remaining workflow time
- once the workflow deadline expires, remaining jobs are not started and count as `summary.skippedJobs`

Sequential example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Plan the next improvement from that summary","model":"claude-opus-4-7-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
```

Sequential interpolation example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Given this summary: {{last.result.response}}","model":"claude-opus-4-7-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
```

Sequential failure control:

- per-step `continueOnFailure` defaults to continuing with later steps
- set `continueOnFailure: false` when a failed step should stop the workflow
- code-level sequential step functions can return `null` to skip a step entirely
- `defaultTrust` also applies to sequential Cursor steps unless a step sets `input.trust` explicitly
- `workerRuntime` also applies to sequential steps and overrides env-based runtime selection for that step

Stop-on-failure example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"cursor","continueOnFailure":false,"input":{"prompt":"Review this diff","model":"composer-2"}},{"kind":"gemini","input":{"prompt":"This only runs if the first step completed","model":"gemini-3-flash-preview"}}]}' | bun run orchestrate -- --file -
```

Retry example:

```bash
echo '{"mode":"parallel","jobs":[{"kind":"gemini","retries":2,"retryDelayMs":500,"input":{"prompt":"Summarize this repo","model":"gemini-3-flash-preview"}}]}' | bun run orchestrate -- --file -
```

Dry-run example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Given this summary: {{last.result.response}}","model":"claude-opus-4-7-high","mode":"plan"}}]}' | bun run orchestrate -- --file - --dry-run
```

Interpolation helpers:

- `{{default(path, "fallback")}}` -> use a fallback value when the path is missing, null, or empty
- `{{json(path)}}` -> JSON-stringify the resolved value

Helper example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Summary: {{default(last.result.response, "missing")}} Raw: {{json(default(last.result.raw, last.result.response))}}","model":"claude-opus-4-7-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
```

MCP tool:

Use `MCP_USAGE.md` as the shorter AI-facing runtime guide for this section. `README.md` remains the full human-facing reference.

- `orchestrate_workflow` runs the same static workflow spec through the MCP server
- input shape: `{ "spec": <parallel-or-sequential workflow>, "cwd": "/optional/default/cwd", "waitForCompletion": true }`
- prefer `orchestrate_workflow` for multi-job, multi-step, mixed-worker, or workflow-trace-oriented tasks; do not default to it for a single worker job when the direct async worker tools are enough
- set `waitForCompletion: false` for long-running workflows so the tool returns immediately with async polling guidance including `requestId`, `status: "running"`, `executionMode: "async"`, `waitMode: "explicit_async"`, `pollWith: "get_orchestration_result"`, `superviseWith: "supervise_orchestration_result"`, `superviseResultWith: "get_orchestration_supervision_result"`, `waitWith: "wait_for_orchestration_result"`, `recommendedFollowUp: "supervise_orchestration_result"`, `warning`, and `nextArgs`
- when `waitForCompletion` is omitted, workflows auto-start in background and return the same polling guidance plus `waitMode: "auto_async"`, `superviseWith: "supervise_orchestration_result"`, `superviseResultWith: "get_orchestration_supervision_result"`, `waitWith: "wait_for_orchestration_result"`, `recommendedFollowUp: "supervise_orchestration_result"`, and `autoAsync: true`
- `waitForCompletion: true` is supported only for trivial workflows: a single Gemini job or sequential step, with retries unset or `0`; Cursor workflows and multi-job specs must use async mode
- `get_orchestration_result` is the primary production follow-up: hand the `requestId` to a background poller and read the stored workflow state/result until terminal
- `supervise_orchestration_result` starts repo-owned detached supervision for a `workflow_*` request and returns a `supervisor_*` request ID immediately
- `get_orchestration_supervision_result` polls the latest stored background supervision result by `supervisor_*` request ID
- `wait_for_orchestration_result` blocks until the stored workflow reaches a terminal state, but it is a short blocking helper rather than the default path for long-running hosts
- `list_orchestration_traces` lists persisted orchestration trace entries with optional filters like `source`, `mode`, `status`, `requestId`, `taskId`, and `limit` (each entry may include `jobModels` with per-job `requestedModel` / optional `reportedModel` when written by a current package version)

Async MCP workflow example:

```json
{
  "spec": {
    "mode": "parallel",
    "jobs": [
      {
        "kind": "cursor",
        "input": {
          "prompt": "Review this diff",
          "model": "claude-opus-4-7-high"
        }
      },
      {
        "kind": "gemini",
        "workerRuntime": "mcp",
        "input": {
          "prompt": "Summarize the review findings in one paragraph.",
          "model": "gemini-3-pro-preview",
          "taskKind": "summarize"
        }
      }
    ]
  },
  "waitForCompletion": false
}
```

Then either hand the request ID to a background poller and fetch the stored result with:

```json
{
  "requestId": "workflow_123"
}
```

Or let the repo start a detached supervision loop and return a `supervisor_*` request ID with:

```json
{
  "requestId": "workflow_123",
  "pollIntervalMs": 1000,
  "timeoutMs": 300000
}
```

Then poll that supervisor result with:

```json
{
  "requestId": "supervisor_123"
}
```

Only if the host can safely keep a short MCP request open, you can block until the workflow finishes with:

```json
{
  "requestId": "workflow_123",
  "pollIntervalMs": 1000,
  "timeoutMs": 300000,
  "includeCompletionSummary": true
}
```

Direct worker MCP tools:

- `run_gemini_worker` / `run_cursor_worker` are synchronous and best for short direct calls; their MCP responses now include sync guidance fields such as `executionMode: "sync"`, `preferredAsyncTool`, `resultTool`, and `warning`
- for long-running jobs, prefer the async start/poll pairs below instead of holding one MCP call open

When to use sync vs async:

- use sync tools when you expect a short, direct worker response and want the full result in one MCP call
- use async tools when the worker may take noticeable time, when you want explicit polling, or when the host should avoid keeping one MCP request open
- use `orchestrate_workflow` when you need multiple jobs/steps, workflow-level traces, or mixed Gemini/Cursor execution
- for a single worker job, prefer `run_gemini_worker_async` or `run_cursor_worker_async` over `orchestrate_workflow`
- if a sync response includes `warning`, treat it as a hint that the same task shape is a better fit for the async start/poll pair
- for long-running MCP orchestration, background polling is the default production path because host/MCP request timeouts can be shorter than the workflow runtime

Direct async worker MCP tools:

- `run_gemini_worker_async` / `run_cursor_worker_async` start a single worker job asynchronously and return a `workflow_*` request ID immediately
- `get_gemini_worker_result` / `get_cursor_worker_result` poll the latest stored result for that async worker request
- these tools are thin aliases over the same orchestration result store used by `orchestrate_workflow`, so they avoid holding one MCP tool call open for the full worker duration and expose configured retry policy plus terminal retry outcomes from that shared store
- direct async worker tools are shell-pinned internally today, so they stay on the local `agent` / `gemini` CLI path even when `MAHIRO_CURSOR_RUNTIME` or `MAHIRO_GEMINI_RUNTIME` selects MCP for other entrypoints
- the synchronous `run_gemini_worker` / `run_cursor_worker` tools still exist for short direct calls, but long-running callers should prefer the async variants

Gemini async MCP example:

```json
{
  "taskId": "gemini-task-1",
  "prompt": "Summarize this repo",
  "model": "gemini-3-flash-preview",
  "approvalMode": "plan",
  "allowedMcpServerNames": "none",
  "retries": 2,
  "retryDelayMs": 500,
  "taskKind": "summarize",
  "timeoutMs": 30000,
  "cwd": "/path/to/project"
}
```

Typical start response:

```json
{
  "requestId": "workflow_123",
  "status": "running"
}
```

Then poll with `get_gemini_worker_result`:

```json
{
  "requestId": "workflow_123"
}
```

Gemini failure note:

- errors such as unauthorized tool calls, `MODEL_CAPACITY_EXHAUSTED`, `429 RESOURCE_EXHAUSTED`, `ECONNRESET`, or `socket hang up` originate upstream in the Gemini CLI/runtime or provider path rather than in this repo’s orchestration code
- the local mitigations in this repo are configured retries/backoff on the async start tool plus shell-pinned direct async execution; this repo does not currently persist full per-attempt history
- Gemini inputs now also support typed CLI control fields like `approvalMode` and `allowedMcpServerNames`; this repo accepts `"none"` as a local convenience for zero MCP servers in authoring-style Gemini jobs

Cursor async MCP example:

```json
{
  "taskId": "cursor-task-1",
  "prompt": "Review this diff",
  "model": "composer-2",
  "mode": "ask",
  "timeoutMs": 30000,
  "cwd": "/path/to/project",
  "trust": true
}
```

Then poll with `get_cursor_worker_result` using the returned `workflow_*` request ID. These direct async polling tools read from the same orchestration result store as `get_orchestration_result`, but they return a flattened worker-specific payload rather than the full workflow envelope. Status transitions like `running`, `completed`, and `runner_failed` stay consistent across workflow-level and single-worker async polling.

Typical polling outcomes:

```json
{
  "requestId": "workflow_123",
  "taskId": "cursor-task-1",
  "kind": "cursor",
  "status": "completed",
  "workflowStatus": "completed",
  "configuredRetries": 2,
  "configuredRetryDelayMs": 500,
  "retryCount": 1,
  "result": {
    "taskId": "cursor-task-1",
    "status": "completed"
  },
  "summary": {
    "totalJobs": 1,
    "finishedJobs": 1,
    "completedJobs": 1,
    "failedJobs": 0,
    "skippedJobs": 0,
    "startedAt": "2026-04-08T00:00:00.000Z",
    "finishedAt": "2026-04-08T00:00:01.000Z",
    "durationMs": 1000
  }
}
```

```json
{
  "requestId": "workflow_123",
  "status": "runner_failed",
  "taskId": "cursor-task-1",
  "kind": "cursor",
  "workflowStatus": "runner_failed",
  "error": "worker process exited unexpectedly"
}
```

For workflow-level orchestration polling, `completed` means the workflow result is ready, while `runner_failed` means the control-plane run itself failed before a normal completed payload could be written. For direct async worker polling, the same status vocabulary is preserved, but the payload is flattened around the first job instead of returning the full workflow envelope.

Trace inspection CLI:

```bash
bun run list-orchestration-traces
bun run list-orchestration-traces -- --limit 50 --source cli
bun run list-orchestration-traces -- --format text --limit 20
bun run list-orchestration-traces -- --format detail --request-id workflow_123
bun run list-orchestration-traces -- --format usage --limit 100
```

`--format usage` prints one JSON object aggregating `traceCount`, `jobCount`, and count maps `byWorkerKind`, `byRequestedModel`, and `byReportedModel` over the filtered traces (legacy traces without `jobModels` still contribute worker-kind counts).

Current usage summary also includes:

- `bySource` and `byWorkflowStatus` for workflow-level operational mix
- `byJobStatus` for per-job failure mode distribution
- `byErrorClass` and `bySourceErrorClass` for normalized reliability views such as rate limiting vs infrastructure vs invalid output
- `retryOutcome` for total retries, retried jobs, and average retries per job
- `durationOutcome` for aggregate job runtime visibility including percentile summaries
- `cacheOutcome` for cache-hit counts and cached token totals when workers report them
- `modelMismatchOutcome` for requested-vs-reported model drift visibility when both model values are present
- `byDay` for daily trace/job rollups
- `workflowOutcome` and `jobOutcome` success-rate summaries
- `byRequestedModelOutcome` for per-model job counts, success rates, retries, durations, cache telemetry, and normalized error-class counts when per-job telemetry is present
- `byReportedModelOutcome` for the same reliability view keyed by the model actually reported by the worker runtime

Local artifact cleanup:

- nested result snapshots under `data/traces/orchestration-results/*.json` are local-only and gitignored
- `test-results/` and `.pulselane-refactor/` are also treated as disposable local outputs

Common inspection flow now also supports time filtering:

- `--from-date <iso-or-date>` -> include traces whose `startedAt` is on/after this point
- `--to-date <iso-or-date>` -> include traces whose `startedAt` is on/before this point

Common inspection flow:

1. Run `bun run orchestrate -- --file <workflow.json>`
2. Copy the returned `requestId`
3. Run `bun run list-orchestration-traces -- --format detail --request-id <that-request-id>`

Concrete example:

```bash
RESULT=$(echo '{"mode":"parallel","jobs":[{"kind":"gemini","input":{"prompt":"Summarize this repo","model":"gemini-3-flash-preview"}}]}' | bun run orchestrate -- --file -)
REQUEST_ID=$(printf '%s' "$RESULT" | jq -r '.requestId')
bun run list-orchestration-traces -- --format detail --request-id "$REQUEST_ID"
```
