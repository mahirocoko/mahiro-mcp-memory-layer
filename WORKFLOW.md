# MCP Memory Layer Workflow

This document defines the worker-first orchestration loop for `apps/mcp-memory-layer`.

`WORKFLOW.md` is the behavioral protocol. For CLI flags, JSON payload shapes, MCP examples, and trace inspection command reference, use `README.md`.

## Core posture

- The orchestrator routes, compares, verifies, and decides.
- Gemini and the Cursor-family `agent` worker do the heavy lifting first.
- Local reads stay shallow before delegation and surgical after worker output.
- Every Gemini and Cursor-family `agent` invocation must declare a model explicitly. No implicit defaults.

## Default loop

1. Orient with minimal grounding.
2. Delegate the right shape of work to Gemini or the Cursor-family `agent` worker.
3. Run workers headlessly whenever possible.
4. Use parallel execution only when worker jobs are independent.
5. Verify with tests, build output, and small targeted reads.
6. Synthesize the result at the orchestrator layer.

## When to use Gemini

Use Gemini for bounded extraction and synthesis work:

- summarize files or docs
- extract facts or timelines
- compare options before implementation
- narrow a large search space before coding

Recommended model ladder:

- `gemini-3-flash-preview` -> normal/easy extraction and summarization
- `gemini-3.1-pro-preview` -> harder synthesis, tradeoffs, or nuanced analysis

Examples:

```bash
bun run gemini -- --model gemini-3-flash-preview --task summarize "Summarize the retrieval pipeline"
bun run gemini -- --model gemini-3.1-pro-preview --cwd /path/to/repo "Review this architecture and propose tradeoffs"
echo '{"taskId":"task-1","prompt":"Summarize this repo","model":"gemini-3-flash-preview","taskKind":"summarize","cwd":"/path/to/repo"}' | bun run gemini-worker
```

## When to use Cursor-family `agent`

Use the Cursor-family `agent` headless path for applied coding work:

- implementation and refactoring
- code review
- patch planning inside the codebase
- edits that benefit from an agent/tool loop

Recommended model ladder:

- `composer-2` -> standard implementation and review
- `claude-4.6-sonnet-medium` -> harder review/refactor and most direct hard work
- `claude-4.6-opus-high` -> complex planning

`--mode plan` is not the default posture. Use it only when the task is complex enough that you need an explicit planning pass. When you do need real planning, start with Opus.

Examples:

```bash
agent -p --model composer-2 --output-format json "Review this diff"
agent -p --model claude-4.6-sonnet-medium --output-format json "Refactor this module safely"
agent -p --model claude-4.6-opus-high --output-format json "Plan a refactor for this package"
agent -p --model claude-4.6-opus-high --output-format json "Plan a deep cross-module refactor"
echo '{"taskId":"task-1","prompt":"Review this diff","model":"composer-2","cwd":"/path/to/repo"}' | bun run cursor-worker

# Repo-local wrapper around the same headless path
bun run cursor -- --model composer-2 "Review this diff"
```

## Headless and parallel usage

Headless is the default posture for local workers. Prefer `agent -p --output-format json ...` or repo-local worker wrappers over interactive usage.

## Parallel execution playbook

Run workers in parallel only when their inputs are fully independent — neither worker's output is needed to form the other's prompt.

**Independent (safe to parallelize):**

- Gemini summarizes one module while Cursor reviews a different file
- Gemini extracts facts from docs while Cursor plans an unrelated refactor
- Two Gemini workers analyze separate subsystems before you synthesize
- Five Cursor workers review five unrelated modules in parallel, then you compare the results

**Dependent (must sequence):**

- Gemini extracts facts → you use those facts to write the Cursor prompt
- Cursor produces a plan → you send that plan to Gemini for critique

Example parallel pattern:

```bash
bun run gemini -- --model gemini-3-flash-preview --cwd /path/to/repo "Summarize the memory retrieval architecture" &
agent -p --model claude-4.6-opus-high --output-format json "Plan the next safe retrieval improvement" &
wait
# Synthesize both outputs here before proceeding
```

Reference note:

- Use `src/features/orchestration/run-parallel-workers.ts` for code-level fan-out and `bun run orchestrate -- --file <workflow.json>` for the same pattern through the package CLI.
- `README.md` is the canonical reference for workflow fields like `maxConcurrency`, `timeoutMs`, `retries`, `retryDelayMs`, `requestId`, dry-run behavior, and trace/result envelope shapes.
- There is no special two-worker limit in the orchestration layer. Fan out only as far as the machine and upstream tools can safely support.

Example sequential pattern (when Gemini output feeds Cursor):

```bash
SUMMARY=$(bun run gemini -- --model gemini-3-flash-preview --cwd /path/to/repo "Summarize the retrieval module")
agent -p --model claude-4.6-opus-high --output-format json "Given this summary: $SUMMARY — plan the next improvement"
```

Programmatic equivalent:

- `src/features/orchestration/run-sequential-workers.ts` runs dependent steps in order and lets each later step derive its next worker job from earlier results.
- `bun run orchestrate -- --file <workflow.json>` is the CLI wrapper for the same dependent-step pattern.
- `README.md` is the canonical reference for interpolation helpers, `continueOnFailure`, and the static workflow JSON shape.

Protocol reminders for MCP and trace verification:

- The `orchestrate_workflow` MCP tool accepts the same static workflow spec and runs it through the same orchestration runtime.
- Prefer `waitForCompletion: false` for workflows that may take noticeable time.
- If `waitForCompletion` is omitted, workflows are auto-started in background and return `{ requestId, status: "running", autoAsync: true }` instead of blocking the MCP client.
- Explicit `waitForCompletion: true` still forces synchronous behavior, so long-running calls can still hit client-side timeout boundaries if the caller insists on waiting.
- The `get_orchestration_result` MCP tool is the polling path for background orchestration runs.
- The `list_orchestration_traces` MCP tool and `list-orchestration-traces` CLI read the same persisted trace data; use the `README.md` command reference for exact flags and example invocations.

Recommended MCP loop for long-running work:

1. Call `orchestrate_workflow` with `waitForCompletion: false` when the workflow is clearly non-trivial.
2. If the tool returns `autoAsync: true`, treat that as a deliberate async fallback rather than an error.
3. Poll `get_orchestration_result` by `requestId` until the stored result is no longer `running`.
4. Use `list_orchestration_traces` or the CLI trace reader for execution forensics.

Telemetry highlights worth checking during verification:

- `byJobStatus`, `byErrorClass`, and `bySourceErrorClass` for failure distribution
- `retryOutcome`, `durationOutcome`, and `cacheOutcome` for reliability and efficiency
- `modelMismatchOutcome` plus `byRequestedModelOutcome` / `byReportedModelOutcome` for requested-vs-reported model behavior

## Verification rule

Worker output is never the final truth.

- verify with `bun run typecheck`
- verify with `bun run test`
- verify with `bun run build`
- spot-check only the files and claims that matter

The orchestrator should not re-read large file clusters after delegation unless verification truly requires it.
