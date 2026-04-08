# Mahiro MCP Memory Layer

Local-first MCP memory layer prototype with:

- append-only canonical JSONL log
- LanceDB-backed retrieval table
- deterministic local embeddings for v0
- MCP tools and resources built on a thin server layer

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

## Operator Shortcut

Use `orch:` at the start of a request when you want strict orchestrator behavior.

- `orch:` means classify first, choose the worker/model explicitly, and delegate before local code work.
- In `orch:` mode, local implementation is restricted to the narrow escape hatch in `AGENTS.md`.
- Verification, synthesis, and final judgment still stay with the orchestrator.

Example:

```text
orch: review this diff with Opus, then verify with tests and build
```

## Cursor wrapper

The native headless Cursor-family entrypoint in this repo is `agent -p --output-format json ...`.

`bun run cursor` is a repo-local wrapper around that `agent` command. Use it when you want this package's normalized JSON envelope and defaults, but do not confuse it with the native headless command itself.

`AGENTS.md` is the primary entrypoint for AI agents in this repo.

`README.md` is the canonical command/reference document for this package. `AGENTS.md` owns worker-selection posture, orchestration behavior, and verification discipline.

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
- `claude-4.6-sonnet-medium` -> harder doer for more difficult implementation/review/refactor work
- `claude-4.6-opus-high` -> planner with the orchestrator, and a doer for very hard work when justified
- if the caller explicitly requests a model, use that exact model rather than silently downgrading
- `--mode plan` is optional and should be used only when the task is complex enough that you need an explicit planning pass

```bash
agent -p --model composer-2 --output-format json "Review this diff"
agent -p --model claude-4.6-sonnet-medium --output-format json "Refactor this package safely"
agent -p --model claude-4.6-opus-high --output-format json "Plan a deep cross-module refactor"

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
  "model": "claude-4.6-opus-high",
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
- `gemini-3.1-pro-preview` -> stronger visual/frontend/artistry work or harder Gemini reasoning

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

Caching:

- completed Gemini results are cached locally by routed prompt + task kind + model + cwd
- repeated equivalent calls can return `cached: true` without a fresh Gemini request
- cache entries expire after 24 hours by default
- cache version mismatches invalidate old entries automatically

```bash
bun run gemini -- --model gemini-3-flash-preview "Summarize this repo"
bun run gemini -- --model gemini-3.1-pro-preview "Review this architecture and propose tradeoffs"
bun run gemini -- --model gemini-3-flash-preview --task summarize "Summarize the latest meeting notes"
bun run gemini -- --model gemini-3-flash-preview --task timeline "Summarize the project timeline from these notes"
bun run gemini -- --model gemini-3.1-pro-preview --timeout-ms 30000 --cwd /path/to/project "Review the current diff"
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
  "taskKind": "summarize",
  "timeoutMs": 30000,
  "cwd": "/path/to/project"
}
```

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

This section documents the command shapes. `AGENTS.md` defines the orchestration posture for when to parallelize, when to sequence, and how to verify the result.

- **Safe:** Gemini designs one frontend surface while Cursor reviews an unrelated backend diff.
- **Safe:** Two Gemini jobs analyze separate visual/frontend areas in parallel.
- **Safe:** Five Cursor jobs review five unrelated files/modules in parallel.
- **Unsafe:** Gemini extracts facts → you use those facts to write the Cursor prompt.

```bash
bun run gemini -- --model gemini-3.1-pro-preview --cwd /path/to/repo "Design the new frontend surface" &
agent -p --model composer-2 --output-format json "Review the unrelated backend diff" &
wait
```

## Orchestrate command

`orchestrate` is the package-level workflow runner for static JSON-defined parallel or sequential job specs.

This section is the canonical reference for CLI flags, workflow JSON fields, async MCP usage, and trace inspection examples. `AGENTS.md` covers the higher-level worker protocol.

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
- `data/traces/orchestration-trace.jsonl` is the append-only telemetry log used by `list_orchestration_traces` and usage summaries
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
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Plan the next improvement from that summary","model":"claude-4.6-opus-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
```

Sequential interpolation example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Given this summary: {{last.result.response}}","model":"claude-4.6-opus-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
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
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Given this summary: {{last.result.response}}","model":"claude-4.6-opus-high","mode":"plan"}}]}' | bun run orchestrate -- --file - --dry-run
```

Interpolation helpers:

- `{{default(path, "fallback")}}` -> use a fallback value when the path is missing, null, or empty
- `{{json(path)}}` -> JSON-stringify the resolved value

Helper example:

```bash
echo '{"mode":"sequential","steps":[{"kind":"gemini","input":{"prompt":"Summarize the retrieval module","model":"gemini-3-flash-preview"}},{"kind":"cursor","input":{"prompt":"Summary: {{default(last.result.response, "missing")}} Raw: {{json(default(last.result.raw, last.result.response))}}","model":"claude-4.6-opus-high","mode":"plan"}}]}' | bun run orchestrate -- --file -
```

MCP tool:

- `orchestrate_workflow` runs the same static workflow spec through the MCP server
- input shape: `{ "spec": <parallel-or-sequential workflow>, "cwd": "/optional/default/cwd", "waitForCompletion": true }`
- set `waitForCompletion: false` for long-running workflows so the tool returns immediately with `{ requestId, status: "running" }` instead of waiting for the full worker response
- when `waitForCompletion` is omitted, workflows auto-start in background and return `{ requestId, status: "running", autoAsync: true }`
- `waitForCompletion: true` is supported only for trivial workflows: a single Gemini job or sequential step, with retries unset or `0`; Cursor workflows and multi-job specs must use async mode
- `get_orchestration_result` reads the stored workflow state/result by `requestId`
- `list_orchestration_traces` lists persisted orchestration trace entries with optional filters like `source`, `mode`, `status`, `requestId`, `taskId`, and `limit` (each entry may include `jobModels` with per-job `requestedModel` / optional `reportedModel` when written by a current package version)

Async MCP example:

```json
{
  "spec": {
    "mode": "parallel",
    "jobs": [
      {
        "kind": "cursor",
        "input": {
          "prompt": "Review this diff",
          "model": "claude-4.6-opus-high"
        }
      }
    ]
  },
  "waitForCompletion": false
}
```

Then fetch the result later with:

```json
{
  "requestId": "workflow_123"
}
```

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
