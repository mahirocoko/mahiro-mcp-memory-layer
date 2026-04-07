# Agent

## Start Here

Read this file first.

Then use the docs in this order:

1. `README.md` for command and interface reference
2. `WORKFLOW.md` for worker usage patterns and orchestration behavior
3. `ORCHESTRATOR.md` for the orchestrator decision loop and verification discipline

## Golden Rules

- Never `git push --force`
- Never `rm -rf` without backup
- Never commit secrets
- Always preserve history
- Always present options when a decision would change history or workflow shape materially
- Always verify before declaring done
- Use Gemini as a subordinate worker for summarization, fact extraction, and bounded synthesis, not as the final source of engineering judgment
- Every Gemini and Cursor-family invocation must set an explicit model
- Keep direct file reads, local code search, and verified tool output as source of truth, but do not use that as an excuse to skip delegation when the task is non-trivial

## Direct Edit Allowlist

Direct inline edits are allowed only for:

- trivial fixes: <=5 lines in 1 file
- greenfield scaffolding from a known pattern when the work is <=5 files
- docs and rule updates
- worker/config wiring
- synthesis artifacts after workers already did extraction or analysis
- emergency hotfixes that are obvious and <=10 lines

Everything else should delegate first.

## Inline-work Tripwires

Stop and delegate if any of these are true:

- you read more than ~100 lines of source without spawning a worker
- you are about to make your 3rd file edit without delegating
- you are writing implementation code rather than docs/config/orchestration glue
- you are mentally summarizing a file instead of asking a worker to summarize it
- you are planning a multi-step refactor in your head instead of sending it to a planning worker

Exception: these tripwires do not apply to small greenfield scaffolding of <=5 files when the pattern is already clear.

## Orchestrator Operating Protocol

Before implementation work:

1. Classify the task shape.
2. If the task needs >3 files or >100 lines of reading, delegate first.
3. Read <=50 lines for orientation before delegation.
4. Spawn workers before broad local reading.

After a worker returns:

1. Run executable checks first.
2. Spot-check <=3 locations and <=80 lines total.
3. If verification still needs broad rereading, escalate to another worker instead of absorbing the context locally.

## Parallel-first Rule

If the task decomposes into 2+ independent subtasks, run workers in parallel.

Do not serialize independent work just because it is easier to think about locally.

## Verification Budget

Preferred order:

1. `bun run typecheck`
2. `bun run test`
3. `bun run build`
4. small targeted reads

If executable checks already reveal the issue, do not keep rereading broadly.

## Local Worker Policy

- Primary posture: remain the orchestrator; workers are support, not the final decision-maker.
- Delegate-first by default for implementation, review, refactor, or multi-file synthesis.
- Gemini is best for summaries, extraction, timelines, and narrow synthesis.
- Cursor-family `agent` is best for implementation, refactors, code review, and planning inside the codebase.
- Final architectural judgment and completion claims stay with the orchestrator.

## Worker Routing

| Task shape | Primary worker | Default model | Verification | Notes |
| --- | --- | --- | --- | --- |
| Summaries, facts, timelines | Gemini | `gemini-3-flash-preview` | spot-check key claims | bounded reduction and extraction |
| Harder synthesis or tradeoffs | Gemini | `gemini-3.1-pro-preview` | verify tradeoff-driving claims | use sparingly |
| Implementation, refactor, code review | Cursor-family `agent` | `composer-2` | run typecheck/tests and inspect touched files | default coding worker |
| Hard review or risky refactor | Cursor-family `agent` | `claude-4.6-sonnet-medium` | targeted diff review plus typecheck/tests | stronger review/refactor tier |
| Complex planning | Cursor-family `agent` | `claude-4.6-opus-high` with `--mode plan` | verify against repo constraints | use only when a real planning pass is needed |

## Frontend Task Routing

Frontend tasks split into two shapes:

**Design-led**: visual layout, styling, component scaffolding, and small static UI work.

- Do directly when the scope is small and the pattern is clear.
- Delegate to Gemini with `gemini-3.1-pro-preview` for larger UI builds and design-led frontend work.
- Treat Gemini as an executor here, not only as a critic or synthesis worker.
- Do not over-orchestrate trivial frontend scaffolding.

**Engineering-led**: state management, data fetching, complex logic, or risky UI refactors.

- Route like any other implementation task through the Worker Routing table.
- Prefer `claude-4.6-sonnet-medium` when the frontend change is logic-heavy or tightly coupled.

**Hard boundaries**:

- Gemini must not own backend changes, API handlers, database logic, auth flows, or shared non-UI infrastructure.
- If a design-led task grows into significant state management, data wiring, or non-local application logic, escalate to Cursor.
- If a task mixes design-led and engineering-led work, split it when practical; otherwise default to Cursor and note why.

## Routing Procedure

1. Classify the task shape first.
2. Choose the worker from the routing table.
3. Pick the lightest model that is still reliable.
4. Pass the model explicitly.
5. Verify with executable checks first, then targeted spot-checks.
6. Escalate only when there is a concrete reason.

## Expected Turn Shape

A good turn:

1. Read <=50 lines for orientation.
2. Classify the task.
3. Delegate.
4. Run typecheck/test/build.
5. Spot-check <=3 locations.
6. Synthesize the result.

A bad turn:

1. Read several files "to understand context."
2. Read more files "to be thorough."
3. Edit multiple files directly.
4. Run tests.
5. Never delegate.

## Escalation Triggers

- required facts or artifacts are still missing after one verification pass
- worker output is weak or incomplete
- facts conflict after targeted checks
- the task has turned into architecture-level judgment
- tests, typecheck, or build failures require deeper reasoning than the current worker/model is providing

## Model Rule

Never rely on implicit model defaults.

- Gemini examples: `gemini-3-flash-preview`, `gemini-3.1-pro-preview`
- Cursor examples: `composer-2`, `claude-4.6-sonnet-medium`, `claude-4.6-opus-high`
