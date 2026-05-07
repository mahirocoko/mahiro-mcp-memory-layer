
## Task 1 - Trusted diagnostics contract decisions

- Freeze `contextSize` as returned item content length plus optional summary length for this contract, matching current source behavior.
- Treat `latestScopeFilter` as plugin/runtime-injected internal diagnostic metadata and scoped-empty output metadata, not as public MCP input.
- Keep `requestId` lookup exact, unscoped, and higher priority than scoped/latest lookup.
- Classify diagnostics as no trace found, empty success, hit, or degraded retrieval; do not conflate `returnedMemoryIds: []` with `degraded: true`.
- Preserve `rankingReasonsById` as advisory ranking diagnostics for returned ids only, not truth/review/source-pointer semantics.
- Include malformed JSONL as a named downstream diagnostic case but defer runtime behavior changes in Task 1 because current parsing throws on malformed JSONL.
- Preserve memory-only boundaries: no workflow, executor, hook ownership, knowledge graph, source-pointer, or truth-engine claims.

## Task 2 - contextSize hardening decisions

- Preserve `contextSize` as the existing returned item text payload-size field and clarify that meaning in `RetrievalTraceEntry` rather than adding a redundant `returnedItemTextSize` field.
- Keep implementation unchanged because `contextSizeForItems()` already matches the Task 1 contract and changing retrieval/context-builder behavior would expand scope unnecessarily.

## Task 3 - summary classification decisions

- Add `summary.classification` with the stable values `no_trace_found`, `empty_success`, `normal_hit`, and `degraded_retrieval` while preserving `hit`, `returnedCount`, and `degraded` for compatibility.
- Include an optional no-trace summary on empty inspect results so callers can machine-test `no_trace_found` without removing existing `status`, `lookup`, `requestId`, or `latestScopeFilter` fields.

## Task 4 - scoped lookup and diagnostics boundary decisions

- Harden Task 4 through tests and evidence only; runtime already injects scoped latest lookup, prioritizes request-id lookup, and keeps `latestScopeFilter` internal.
- Keep provenance assertions diagnostic-only by pinning exact `surface`, `trigger`, `phase`, and `searchScope` values without adding workflow or executor ownership semantics.
- Treat `rankingReasonsById` as coarse label diagnostics for returned memory ids only, and explicitly avoid numeric scoring/explanation fields.

## Task 5 - docs alignment decisions

- Update `MCP_USAGE.md`, `CONTINUITY_DEBUGGING.md`, and `ARCHITECTURE.md` to reflect the tested four-case retrieval vocabulary and the `contextSize` payload-size definition.
- Keep `requestId` as the only public `inspect_memory_retrieval` input and describe `latestScopeFilter` only as injected diagnostic metadata for plugin-scoped empty latest lookup.
- Defer malformed JSONL resilience runtime changes for now, and record that deferral in the contract notes instead of claiming a new handling path in public docs.

## Task 6 - full verification decisions

- Use `.sisyphus/evidence/task-6-full-verification.txt` as the single combined log for focused tests plus full verification, with individual command outputs kept in the required typecheck/test/build files.
- Keep Task 6 scoped to evidence packaging and notepad updates only; no runtime, source, test, or docs changes were needed because verification passed.

## Task 6 - evidence summary scope correction

- Keep `task-6-summary.txt` scoped to the current trusted-memory-diagnostics plan evidence list instead of globbing every `.sisyphus/evidence/task-*` file, because the evidence directory can contain prior-plan artifacts.
