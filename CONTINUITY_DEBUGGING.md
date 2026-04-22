# Continuity Debugging

Use this when the user asks to continue prior work, recall earlier decisions, or debug why continuity did or did not trigger.

## Default order

Start with plugin-native memory diagnostics before broader recap/search flows.

1. `memory_context`
2. `inspect_memory_retrieval`
3. broader recap/search only if the direct diagnostics are still insufficient

## What to inspect in `memory_context`

Check:

- current runtime mode
- latest event type
- cached sections (`wakeUp`, `prepareTurn`, `prepareHostTurn`)
- startup brief
- scope resolution and session identity
- coordination state such as message debounce versioning

If continuity feels stale, missing, or inconsistent, confirm whether the expected memory preparation already ran and whether the cached scope matches the active session.

## What to inspect in `inspect_memory_retrieval`

Use it to answer:

- did retrieval hit or miss?
- was it degraded?
- what query was used?
- what provenance labels were attached?

## Routing rule

When the issue is “why didn’t the session continue the way I expected?”, do not jump straight to broad search. First determine whether the plugin-native memory cache and retrieval path already contain the context you expected to see.
