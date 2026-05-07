# Trusted Memory Diagnostics Contract

Task: Freeze Trusted Diagnostics Contract. This file defines the trusted memory diagnostics contract before runtime implementation. It records current behavior and downstream expectations without changing runtime behavior.

## Scope and non-goals

- Scope: `inspect_memory_retrieval`, retrieval trace entries, scoped latest lookup behavior, request-id lookup behavior, provenance, ranking reasons, `contextSize`, and explicit diagnostics classification.
- No runtime behavior changes are part of this task.
- `latestScopeFilter` must not be exposed as a public MCP input parameter. It is plugin/runtime-injected internal diagnostic metadata used when no `requestId` is supplied.
- This contract stays inside the memory-only package boundary. It must not introduce source-pointer, review truth-engine, knowledge graph, workflow, executor, or host lifecycle ownership claims.

## Source-of-truth behavior map

- `src/features/memory/types.ts` defines `RetrievalTraceEntry`, `InspectMemoryRetrievalInput`, and inspect result unions.
- `src/features/memory/memory-service.ts` implements lookup order: `requestId` first, then `latestScopeFilter`, then global latest.
- `src/features/memory/retrieval/hybrid-search.ts` emits retrieval traces and currently computes `contextSize` from returned item `content.length + summary.length` for every returned item.
- `src/features/memory/observability/retrieval-trace.ts` reads JSONL traces, returns missing-file as empty, and currently throws on malformed non-empty JSONL lines.
- `src/features/memory/schemas.ts` exposes public `inspect_memory_retrieval` input with `requestId` only.
- `src/features/opencode-plugin/runtime-shell.ts` injects `latestScopeFilter` from active session scope when the plugin tool is called without `requestId`; explicit `requestId` lookup remains unscoped.

## Trace entry fields

Trusted diagnostics are based on the current `RetrievalTraceEntry` shape:

- `requestId`: generated trace id for exact lookup.
- `query`: retrieval query or task text used by the search/build path.
- `retrievalMode`: `query`, `profile`, `recent`, or `full` mode as emitted by retrieval.
- `enforcedFilters`: effective memory scope filter, including `scope`, `projectId`, and `containerId` when present.
- `provenance`: optional origin metadata with `surface`, `trigger`, `phase`, and `searchScope`.
- `returnedMemoryIds`: ids returned by retrieval, in returned order.
- `rankingReasonsById`: advisory per-id ranking reasons for returned ids only.
- `contextSize`: current computed size from returned item content plus summary lengths.
- `embeddingVersion`, `indexVersion`, `degraded`, `createdAt`: trace metadata used for diagnostics.

## `contextSize`

Current contract:

- `contextSize` is the sum of every returned item's `content.length` plus `summary.length` when a summary exists.
- Empty retrieval with no returned ids should produce `contextSize: 0` when a trace exists.
- `contextSize` is not currently the rendered prompt length and is not the continuity-cache size.
- Downstream runtime/tests must preserve this meaning unless a future task explicitly migrates the contract and docs together.

## summary classification

`inspect_memory_retrieval` results must be classified from trace existence, `returnedMemoryIds`, and `degraded`:

| Classification | Required signal | Meaning |
| --- | --- | --- |
| No trace found | `status: "empty"` | No trace matched the lookup. Do not infer degraded retrieval or empty success. |
| Empty success | `status: "found"`, `returnedMemoryIds: []`, `contextSize: 0`, `degraded: false` | Retrieval completed cleanly but returned no scoped memories. |
| Hit | `status: "found"`, one or more `returnedMemoryIds`, `degraded: false` | Retrieval returned scoped memory ids. |
| Degraded retrieval | `status: "found"`, `degraded: true` | Retrieval ran in degraded/fail-open mode, regardless of whether ids were returned. |

The inspect result summary remains `hit`, `returnedCount`, and `degraded`; user-facing docs may describe the classification in words, but implementation must not conflate empty success with degraded retrieval.

## Latest scoped lookup and `latestScopeFilter`

Contract:

- When no `requestId` is supplied through the plugin tool and an active session scope exists, the plugin runtime injects `latestScopeFilter` with `projectId` and `containerId` from session scope.
- `latestScopeFilter` is internal/plugin-side input to the memory backend, not public MCP input.
- The backend uses `latestScopeFilter` to scan traces from newest to oldest and return the latest trace whose `enforcedFilters.projectId` and `enforcedFilters.containerId` match supplied filter fields.
- If the scoped latest lookup misses, the empty result includes the attempted `latestScopeFilter`. This is output/internal diagnostic metadata, not a public input contract.
- A scoped miss proves no matching trace was found for that attempted scoped lookup. It does not prove the global trace store is empty.

## `requestId` lookup

Contract:

- `requestId` lookup takes precedence over all latest lookup behavior.
- Public `inspect_memory_retrieval` input exposes `requestId` only.
- Request-id lookup is exact and unscoped, including through the plugin path.
- Missing request id returns `status: "empty"`, `lookup: "request_id"`, and echoes `requestId`.
- Existing request id returns `status: "found"`, `lookup: "request_id"`, the trace, and summary fields derived from that trace.

## provenance

Contract:

- `provenance` is optional trace metadata, not an authorization boundary.
- Tool calls should use memory-service/tool provenance such as `surface: "tool"`, `trigger: "search_memories"`, and `phase: "search"` when emitted by the stable tool path.
- Plugin lifecycle-triggered memory preparation may use `surface: "opencode-plugin"` with trigger/phase values such as `message.updated`, `message.part.updated`, `session.idle`, `turn-preflight`, `host-turn-persistence`, or `compaction-checkpoint` as applicable.
- `searchScope` is trace metadata describing the search scope and must stay diagnostic-only.
- Provenance must not be expanded into workflow ownership, executor ownership, or host lifecycle control claims.

## Ranking reason boundary

Contract:

- `rankingReasonsById` mirrors returned search item reasons for returned ids only.
- Current reasons include ranking/retrieval signals such as `scope_match`, `keyword_match`, and `semantic_match`.
- Ranking reasons are explanatory diagnostics, not truth signals, review decisions, source pointers, or a knowledge graph.
- Downstream diagnostics may display ranking reasons but must not treat them as proof that memory content is true.

## malformed JSONL include/defer

Contract status:

- Malformed JSONL is included as a named diagnostics case for downstream work.
- Runtime behavior changes for malformed JSONL are deferred from Task 1.
- Current source inspection shows `RetrievalTraceStore.readAll()` parses each non-empty JSONL line and throws on malformed JSON, while missing trace files return an empty list.
- Until downstream implementation changes this, malformed JSONL must not be documented as empty success or degraded retrieval.
- Future handling should distinguish malformed trace storage from no-match lookup and degraded retrieval; this contract intentionally does not choose a breaking public rename.

## Planned downstream fixtures

The following fixture names are planned contract fixtures for downstream tasks and are not current fixtures yet:

- `project-alpha`
- `container-main`
- `container-other`
- `req-hit-001`
- `req-empty-001`
- `req-degraded-empty-001`
- `mem-001`

Downstream tests may introduce these names to cover scoped hit, scoped miss, request-id hit, request-id miss, empty success, degraded empty retrieval, and ranking/provenance boundaries.

## Compatibility constraints

- Preserve public compatibility for `inspect_memory_retrieval` by keeping `requestId` as the public input.
- Do not expose `latestScopeFilter` through `src/features/memory/schemas.ts` public MCP input.
- Do not rename existing trace fields in a breaking way.
- Keep continuity-cache diagnostics separate from durable retrieval traces and memory records.
- Keep host lifecycle details memory-facing only.
