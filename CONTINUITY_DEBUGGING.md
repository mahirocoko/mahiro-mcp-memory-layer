# Continuity Debugging

Use this when the user asks to continue prior work, recall earlier decisions, or debug why continuity did or did not trigger.

## Default order

Start with plugin-native memory diagnostics before broader recap/search flows.

1. `memory_context`
2. `inspect_memory_retrieval`
3. `runtime_capabilities`
4. broader recap/search only if the direct diagnostics are still insufficient

## What to inspect in `memory_context`

Check:

- current runtime mode
- latest event type
- cached sections (`wakeUp`, `prepareTurn`, `prepareHostTurn`)
- lifecycle diagnostics for `session-start-wake-up`, `turn-preflight`, `idle-persistence`, and `compaction-continuity`
- startup brief
- scope resolution and session identity
- coordination state such as message debounce versioning

If continuity feels stale, missing, or inconsistent, confirm whether the expected memory preparation already ran, whether the cached scope matches the active session, and whether the lifecycle diagnostics show a skipped, failed-open, or not-run stage.

## What to inspect in `inspect_memory_retrieval`

Use it to answer:

- did retrieval hit or miss?
- was it degraded?
- what query was used?
- what provenance labels were attached?

Then check `runtime_capabilities` when you need to confirm whether lifecycle diagnostics and compaction continuity are currently exposed by the plugin-native path.

## Routing rule

When the issue is “why didn’t the session continue the way I expected?”, do not jump straight to broad search. First determine whether the plugin-native memory cache, retrieval path, and lifecycle diagnostics already contain the context you expected to see.
