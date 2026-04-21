# Learning: requested-state-before-execution-truth

**Date**: 2026-04-21
**Tags**: orchestration, plugin, executor-first, truth-model, requested-state

## Insight

When an async orchestration request is accepted but there is not yet proof that the chosen executor has actually started, the system should record that state as `requested`, not `running`. This keeps the conversation owner honest and avoids overstating Gemini/Cursor involvement.

## Why It Matters

The user notices the difference immediately. If the UI or summary says Gemini already worked when the task actually aborted before execution, trust drops faster than any architectural elegance can compensate. A truthful pre-execution state also prevents secondary bugs like wrongly suppressing continuity preflight or making category routing feel like execution evidence.

## Durable Rule

Use three layers of truth:

1. `intent` says what kind of work is being asked for.
2. `executor` says which runtime is meant to do it.
3. `requested` vs `running` says whether execution has merely been accepted or has actually started.

Do not let category or route selection impersonate execution truth.
