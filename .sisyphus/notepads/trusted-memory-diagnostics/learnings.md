
## Task 1 - Trusted diagnostics contract learnings

- `RetrievalTraceEntry` in `src/features/memory/types.ts` already carries `requestId`, `provenance`, `returnedMemoryIds`, `rankingReasonsById`, `contextSize`, `degraded`, and enforced scope filters.
- `MemoryService.inspectMemoryRetrieval()` checks `requestId` first, then `latestScopeFilter`, then global latest; missing request ids and scoped misses return explicit empty result shapes.
- `runHybridSearch()` currently computes `contextSize` from returned item content length plus summary length, not from rendered context length or continuity cache size.
- `runtime-shell.ts` injects `latestScopeFilter` from active plugin session scope when no `requestId` is supplied, while request-id lookup remains unscoped.
- Public schema in `src/features/memory/schemas.ts` exposes only `requestId` for `inspect_memory_retrieval`; `latestScopeFilter` is backend/internal metadata.
- `RetrievalTraceStore.readAll()` currently returns an empty list for a missing trace file but throws on malformed non-empty JSONL lines.
- Existing tests cover scoped latest inspection and request-id inspection, but planned fixture names (`project-alpha`, `container-main`, `container-other`, `req-hit-001`, `req-empty-001`, `req-degraded-empty-001`, `mem-001`) are not current fixtures yet.

## Task 2 - contextSize hardening learnings

- `runHybridSearch()` already emits `contextSize` before context rendering, so build-context truncation can be tested without changing retrieval ranking/filtering or renderer output.
- A deterministic `mem-001` retrieval-table fixture with `project-alpha` / `container-main` cleanly proves the exact payload formula: `content.length + summary.length`.
- `buildContextForTask()` may render zero selected items under a tiny `maxChars` budget while the retrieval trace still records returned ids and returned item payload size.

## Task 3 - summary classification learnings

- `inspectMemoryRetrieval()` can classify summaries entirely from trace presence, `trace.returnedMemoryIds.length`, and `trace.degraded`; no retrieval ranking/filtering changes are needed.
- Manual `RetrievalTraceStore.append()` fixtures are enough to cover `req-hit-001`, `req-empty-001`, and `req-degraded-empty-001` deterministically without coupling classification tests to search scoring.

## Task 4 - scoped lookup and diagnostics boundary learnings

- Plugin `inspect_memory_retrieval` can be tested with exact `project-alpha` / `container-main` fixture scope by pinning the singleton runtime session state after normal session creation; no runtime behavior change is needed.
- The required schema-boundary grep for `latestScopeFilter` in `src/features/memory/schemas.ts` produces no output, confirming the public schema still exposes only `requestId` for inspect input.
- Real retrieval traces provide enough surface to assert `rankingReasonsById` as coarse labels (`scope_match`, `keyword_match`, `semantic_match`) for returned ids only, without introducing score explanations.

## Task 5 - docs alignment learnings

- The public docs needed an explicit four-way classification vocabulary, not just prose around empty success and degraded retrieval, so the wording now mirrors `no_trace_found`, `empty_success`, `normal_hit`, and `degraded_retrieval`.
- `contextSize` was easiest to keep clear by naming the returned payload formula directly in the docs, which avoids confusion with rendered context length and continuity cache size.
- `latestScopeFilter` is best documented as plugin-injected diagnostic metadata on empty scoped latest lookup, because that matches the contract without exposing a new public MCP input.

## Task 6 - full verification learnings

- Focused Task 2-5 checks can be rerun with Vitest `-t` filters before the full AGENTS.md verification order, while keeping all command output in the combined Task 6 evidence log.
- The final repo verification order remains `rtk bun run typecheck`, `rtk bun run test`, then `rtk bun run build`; all three completed successfully for this packaging pass.
