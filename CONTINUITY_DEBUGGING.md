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

## Empty vs degraded retrieval

Use this matrix to separate empty success from degraded retrieval:

| Classification | Returned IDs | Trace fields | Meaning |
| --- | --- | --- | --- |
| `no_trace_found` | none | `status: "empty"` | No retrieval trace was available, so `inspect_memory_retrieval` could not summarize a run. Next action: confirm the `requestId` or the latest-scoped lookup. |
| `empty_success` | `returnedMemoryIds: []` | `contextSize: 0`, `degraded: false` | Retrieval completed cleanly, but no matching or scoped context was returned. This can happen when `projectId` or `containerId` is wrong or missing, records exist globally but not in the current project scope, storage was reset, or storage was never seeded. |
| `normal_hit` | one or more IDs | `returnedMemoryIds: [...], degraded: false` | Retrieval completed and returned matching scoped context; use returned IDs as the hit signal. |
| `degraded_retrieval` | any IDs or none | `degraded: true` | Retrieval ran in degraded or fail-open mode. Treat this separately from empty success, because degraded retrieval is not the same condition as `returnedMemoryIds: []` with `degraded: false`. Next action: inspect trace/provenance and run verification/eval if this was unexpected. |

`returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false` means `empty_success`: the retrieval finished cleanly, but no scoped context was returned. `contextSize` is the returned item payload size, `content.length` plus `summary.length` when present, not rendered context length and not the continuity-cache size.

`inspect_memory_retrieval` exposes `requestId` only as public input. When the plugin path runs without a `requestId`, it may inject the active session scope internally and return `latestScopeFilter` as diagnostic metadata on an empty scoped latest lookup. That metadata is not a public input contract.

When a latest scoped lookup is empty, the attempted `latestScopeFilter` shows that no matching trace was found for that scope, not that the global trace store is empty.

`degraded: true` means the retrieval path fell back into degraded or fail-open behavior. It may still return IDs, and it is not the same as an empty successful retrieval.

Keep the boundary clear between durable memory records and the `memory_context` continuity cache. The cache can still hold wake-up or turn-preflight state even when durable memory retrieval returns nothing.

## Routing rule

When the issue is “why didn’t the session continue the way I expected?”, do not jump straight to broad search. First determine whether the plugin-native memory cache, retrieval path, and lifecycle diagnostics already contain the context you expected to see.
