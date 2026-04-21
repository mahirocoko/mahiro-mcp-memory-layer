# Continuity Debugging

Use this when the user asks to continue prior work, recall earlier decisions, or debug why continuity did or did not trigger.

## Default order

Start with plugin-native diagnostics before broader recap/search flows.

1. `memory_context`
2. `inspect_memory_retrieval`
3. broader recap/search only if the direct diagnostics are still insufficient

## What to inspect in `memory_context`

Check:

- current runtime mode
- latest event type
- cached sections (`wakeUp`, `prepareTurn`, `prepareHostTurn`)
- startup brief
- `session.operator.orchModeEnabled`
- `session.operator.tasks[]`

For orchestration continuity bugs, pay special attention to each tracked task’s:

- `intent`
- `status`

If an `implementation` task is still truly `running`, suppressed continuity-style preflight on the plugin path is expected. A merely `requested` task should not suppress preflight.

## What to inspect in `inspect_memory_retrieval`

Use it to answer:

- did retrieval hit or miss?
- was it degraded?
- what query was used?
- what provenance labels were attached?

## Routing rule

When the issue is “why didn’t the session continue the way I expected?”, do not jump straight to recap or broad search. First determine whether the plugin operator loop was deliberately preserving the executor lane because a truly running implementation task was still active.
