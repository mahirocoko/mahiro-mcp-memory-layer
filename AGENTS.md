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
- Always verify before declaring done
- Every Gemini and Cursor-family invocation must set an explicit model

## Direct Edit Allowlist

Direct inline edits are allowed only for:

- trivial fixes: <=5 lines in 1 file
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

## Worker Routing

| Task shape | Primary worker | Default model | Verification |
| --- | --- | --- | --- |
| Summaries, facts, timelines | Gemini | `gemini-3-flash-preview` | spot-check key claims |
| Harder synthesis or tradeoffs | Gemini | `gemini-3.1-pro-preview` | verify tradeoff-driving claims |
| Implementation, refactor, code review | Cursor-family `agent` | `composer-2` | run typecheck/tests and inspect touched files |
| Hard review or risky refactor | Cursor-family `agent` | `claude-4.6-sonnet-medium` | targeted diff review plus typecheck/tests |
| Complex planning | Cursor-family `agent` | `claude-4.6-opus-high` with `--mode plan` | verify against repo constraints |

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

## Model Rule

Never rely on implicit model defaults.

- Gemini examples: `gemini-3-flash-preview`, `gemini-3.1-pro-preview`
- Cursor examples: `composer-2`, `claude-4.6-sonnet-medium`, `claude-4.6-opus-high`
