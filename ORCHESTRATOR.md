# Orchestrator Operating Protocol

This file defines how the orchestrator should work in this repo.

`README.md` owns command and interface reference.

`WORKFLOW.md` owns worker usage patterns and orchestration behaviors.

`ORCHESTRATOR.md` owns the orchestrator decision loop: what to read, when to delegate, how to verify, and when to stop.

## Core role

- The orchestrator routes, delegates, verifies, and decides.
- Workers do extraction, planning, review, and most implementation-heavy reading first.
- Final judgment stays at the orchestrator layer.

## Pre-action checklist

Before implementation work:

1. Classify the task shape.
2. Decide whether the work is docs-only, config-only, or real implementation.
3. Read only enough local code to write a good worker prompt.
4. Delegate before broad local reading when the task is non-trivial.

Grounding-read budget: keep orientation reads to about 50 lines total before delegation.

## Delegation default

Delegate first when any of these are true:

- the task needs more than about 100 lines of source reading
- the task touches more than 3 files
- the task needs multi-file synthesis or planning
- the task is review, refactor, or implementation rather than simple docs/config edits

Direct edits are fine for:

- small docs updates
- config wiring
- worker-prompt/config changes
- tiny obvious fixes (<=5 lines, 1 file)
- emergency hotfixes that are obvious and <=10 lines

## Worker selection

- Use Gemini for bounded summarization, extraction, timelines, and narrow synthesis.
- Use the Cursor-family `agent` path for implementation, refactors, code review, and planning inside the codebase.
- Use the lightest model that is reliable for the task.
- Always pass an explicit model.

## Verification budget

After a worker returns:

1. Run executable checks first.
2. Spot-check only the highest-risk claims.
3. Keep post-worker spot-checks to <=3 locations and <=80 lines total.
4. Avoid re-reading large file clusters unless verification truly requires it.

Preferred verification order:

- `bun run typecheck`
- `bun run test`
- `bun run build`
- small targeted reads

## Parallel rule

Parallelize only when subtasks are independent.

Do not parallelize when one worker output is needed to form the next prompt.

## Stop rule

Do not stop at analysis if the task is still actionable.

Stop when one of these is true:

- the requested implementation and verification are complete
- the remaining blocker is external and clearly identified
- the user redirects the work

## Expected turn shape

A good turn:

1. Read <=50 lines for orientation.
2. Classify the task.
3. Delegate.
4. Run typecheck/test/build.
5. Spot-check <=3 locations and <=80 lines.
6. Synthesize the result.

A bad turn:

1. Read several files "to understand context."
2. Read more files "to be thorough."
3. Edit multiple implementation files directly.
4. Run tests.
5. Never delegate.

## Escalation rule

Escalate when:

- worker output is weak after one verification pass
- facts conflict after targeted checks
- the task turns into architecture-level judgment
- production-critical behavior is still uncertain after tests and targeted reads
