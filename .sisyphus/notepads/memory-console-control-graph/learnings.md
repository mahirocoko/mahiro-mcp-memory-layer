
## 2026-05-09 05:59:56Z - memory-viewer implementation/test map for migration
- Source identity files confirmed: src/memory-viewer.ts and src/features/memory-viewer/{filters.ts,reader.ts,render.ts,server.ts,types.ts}.
- Test identity files confirmed: tests/memory-viewer-filters.test.ts, tests/memory-viewer-render.test.ts, tests/memory-viewer-server.test.ts.
- Entry/export flow: main() in src/memory-viewer.ts wires createLocalReadOnlyMemoryReader() + startMemoryViewerServer(); parsePort validates --port and defaults to defaultMemoryViewerPort.
- Reader responsibilities: createLocalReadOnlyMemoryReader() builds readAll/list/search via JsonlLogStore + listMemories/searchMemories; search traces use trigger=memory_viewer.
- Server responsibilities: loadViewerMemories() chooses indexed search only for complete scopes (canUseIndexedSearch) else canonical readAll+local filter; createMemoryViewerServer() serves only GET/HEAD, 405 for other methods with read-only message, no-store cache.
- Render responsibilities: renderMemoryViewerPage()/renderEmptyViewerPage() produce read-only HTML; no mutation forms/actions; escaping centralized in escapeHtml()/escapeAttribute().
- Filter responsibilities: normalizeViewerFilters(), filterViewerMemories(), aggregateViewerProjectScopes(), filtersToSearchParams(), canUseIndexedSearch(); defaults prioritize verified+active and firehose all/all.
- Safety assertions covered by tests: localhost-only host, no write-capable API imports/calls in viewer files, no mutation controls in rendered HTML, and escaping of content/source/evidence/review fields.
- Coverage gap to track during rename: tests exercise loadViewerMemories and render/filter behavior heavily, but do not directly assert HTTP HEAD body-empty semantics or 405/404 route responses via server instance requests.

## 2026-05-09 06:00:35Z - rejected-only purge and graph projection map
- Canonical JSONL mutations are replace-by-id, not in-place edits: JsonlLogStore.append() appends one record line; replaceRecordById() rewrites the entire file from readAll() with the target id swapped; readAll() validates each JSONL line through memoryRecordSchema.
- Review mutations live in MemoryService.reviewMemory(): reject sets reviewStatus="rejected", defer sets "deferred", edit_then_promote clears reviewStatus, updates verification fields, appends reviewDecisions history, then rewrites log + deletes/reinserts the retrieval row for the same id.
- Promotion/upsert consistency pattern is the same: promoteMemory() and upsertDocument() call logStore.replaceRecordById(), then table.deleteRowsByIds([id]), then rebuild the retrieval row via toRetrievalRow()/embeddingProvider and table.upsertRows([row]).
- Retrieval index deletion support is explicit in MemoryRecordsTable.deleteRowsByIds(); table.replaceAll() is the bulk reindex path used by reindexMemoryRecords() from canonical log readAll().
- Graph/projection-relevant fields are already on MemoryRecord/WikiSelectedRecord: kind, scope, projectId, containerId, source, content, summary, tags, importance, verificationStatus, reviewStatus, reviewDecisions, verifiedAt, verificationEvidence, createdAt, updatedAt. Review-hint graph edges are derived only from MemoryReviewHint.relatedMemoryIds and the hint types likely_duplicate / possible_contradiction / possible_supersession.
- Validation/tests to reuse: tests/memory-service.test.ts covers reject/defer/edit_then_promote, review queue overview hints, assist suggestions, promotion, reindex, and retrieval inspection classifications; tests/wiki-materializer-selector.test.ts covers rejected exclusion and projection selection; tests/rank.test.ts and tests/hybrid-search.test.ts cover retrieval row scoring/shape.

## 2026-05-09 13:01 +07 — POST-only destructive admin console patterns

- HTTP semantics: POST is unsafe/non-idempotent; successful destructive POSTs should usually land on a GET confirmation/summary page via 303 See Other, not a method-preserving redirect. MDN explicitly says 303 is often used after PUT/POST so the client can retrieve a confirmation page, and the redirected request is always GET.
- Method handling: unsupported verbs should return 405 Method Not Allowed and include an Allow header listing supported methods. Validation/syntax failures should return 400 Bad Request instead of redirecting.
- Strong preview gate: Django admin delete confirmation renders a delete preview before submit, shows affected objects, and posts back with CSRF + a hidden `post=yes` flag. That is a good model for confirmation-gated deletion in a local console.
- Public examples of POST delete + 303: IBM mcp-context-forge delete endpoint and CERT-Polska Artemis export delete both mutate via POST and then return `RedirectResponse(..., status_code=303)`.
- Practical local-console guidance: keep destructive routes POST-only, render a preview/confirmation page first, reject wrong methods with 405, reject invalid input with 400, and redirect successful deletes back to a safe GET summary page with 303.

## 2026-05-09 06:18:14Z - memory-console rename and verification
- Renamed the product surface from memory-viewer to memory-console across src, tests, and package script metadata.
- Preserved the read-only localhost console shape: startup copy now says "Memory console listening" and the server still binds to 127.0.0.1.
- Verification passed: typecheck, memory-console test run, package script guard, and source/package/tests identity grep; remaining historical viewer strings are outside the source/package surface.

## 2026-05-09 13:25 +07 — rejected-only purge service API

- Added internal MemoryService.purgeRejectedMemories(), not an MCP tool, so Task 6 can wire UI later without expanding the current public tool surface.
- Purge validation is destructive-action gated by confirmation="DELETE REJECTED", non-empty unique ids, and strict scope shape: project requires projectId/containerId while global rejects both.
- Canonical deletion uses a JSONL rewrite helper that re-reads current records and returns deleted records plus missing ids; retrieval index rows are deleted only for records actually removed from the canonical log.
- Mixed batches are intentionally per-id: deleted, skipped_not_found, skipped_not_rejected, skipped_scope_mismatch, or dry_run.
- Verification passed for focused purge tests, full memory-service tests, full test suite, and build; full repo typecheck is currently blocked by unrelated unused _validatedInput variables in src/features/memory-console/server.ts.

## 2026-05-09 06:26:35Z - memory-console route/action contracts
- Added explicit GET page routes for /, /review, /rejected, and /graph while keeping GET/HEAD read-only through the existing loadConsoleMemories path.
- Added POST-only action contracts for review/promote/purge-rejected with deterministic 400 validation, 303 redirects on valid placeholder outcomes, and 405 Allow headers for wrong methods.
- Verification passed: lsp diagnostics on modified TS files, rtk bun run typecheck, rtk bun run build, rtk bun run test -- memory-console-server, plus focused QA evidence files for browse and blocked GET action routes.

## 2026-05-09 13:31 +07 — rejected-only purge acceptance coverage

- Added Task 3 follow-up tests in tests/memory-service.test.ts only; no service/schema changes were needed because existing validation already enforces the acceptance rules.
- Non-rejected coverage now explicitly proves verified, pending, and deferred records all return skipped_not_rejected and remain in both canonical log and retrieval search results.
- Validation coverage now proves duplicate ids, missing project scope ids, and forbidden global scope ids fail before deletion; the rejected validation target remains searchable afterward.
- Verification passed: lsp diagnostics on tests/memory-service.test.ts, rtk bun run test -- memory-service -t "purge rejected" (6 passed), and rtk bun run test -- memory-service (44 passed).

## 2026-05-09 13:40 +0700 — read-only memory graph projection model

- Added `src/features/memory-console/graph.ts` as a pure metadata projection: no filesystem, network, log store, retrieval table, index, or graph persistence dependencies.
- Graph node keys are stable by contract: `memory:${id}`, `source:${type}:${uri ?? ""}:${title ?? ""}`, `tag:${tag}`, and `evidence:${type}:${value}`.
- Related-memory edges are intentionally advisory-only and derive only from supplied `MemoryReviewHint.relatedMemoryIds` or `ReviewAssistSuggestion.relatedMemoryIds`; raw records without those inputs produce no relation edges and no warnings.
- Missing related ids produce deterministic `missing_related_memory` warnings instead of throwing or creating dangling edges.
- Verification passed: clean LSP diagnostics on changed TS files, `rtk bun run test -- memory-console-graph` (7 passed), `rtk bun run typecheck`, `rtk bun run build`, and forbidden-import grep on `graph.ts`.

## 2026-05-09 13:51 +07 — console browse vs review management split

- Kept browse safety by leaving `renderMemoryConsolePage()` data-only and moving POST reviewer controls into a separate `renderReviewConsolePage()` used only by `GET /review`.
- Added a narrow backend abstraction in console types: read-only browse/search stays available everywhere, while `listReviewQueueOverview`, `getReviewAssist`, `reviewMemory`, and `promoteMemory` are optional capabilities that tests can spy on without leaking write controls into browse rendering.
- Review POST parsing now matches memory-service inputs directly: `id`, `action`, `note`, optional `evidence`, and optional `content`/`summary`/`tags` for `edit_then_promote`; successful actions redirect with 303 to safe GET routes.
- Verification passed: clean LSP diagnostics on all changed console files, `rtk bun run test -- memory-console-server -t "serves GET / as browse mode"`, `rtk bun run test -- memory-console-server -t "POST action"`, `rtk bun run test -- memory-console-render memory-console-server`, `rtk bun run typecheck`, and `rtk bun run build`.

## 2026-05-09 13:56 +07 — real local console backend management adapter

- Closed the CLI integration gap by changing `src/memory-console.ts` to use `createLocalMemoryConsoleBackend()` instead of the older read-only helper.
- The local backend keeps the existing browse/search lambdas (`readAll`, `list`, `search`) but now wraps them with a minimal adapter that delegates `listReviewQueueOverview`, `getReviewAssist`, `reviewMemory`, and `promoteMemory` to `MemoryService`.
- This keeps GET/HEAD routes non-mutating while allowing the real local console server to execute the same review/promote actions that server tests previously exercised only through injected spies.
- Verification passed: clean LSP diagnostics on `reader.ts`, `memory-console.ts`, `types.ts`, and `memory-console-server.test.ts`; `rtk bun run test -- memory-console-server -t "adapts the local console backend to expose review and promote methods"`; `rtk bun run test -- memory-console-render memory-console-server`; `rtk bun run typecheck`; `rtk bun run build`.

## 2026-05-09 14:09 +07 — rejected quarantine and guarded purge UI

- Added a dedicated `/rejected` quarantine renderer that keeps rejected records separate from browse/review controls and uses dry-run-first purge forms.
- `POST /actions/purge-rejected` now validates non-empty ids, strict global/project scope fields, dryRun, and exact final confirmation `DELETE REJECTED` before calling the purge backend.
- Dry-run and final purge responses render per-id outcomes, preserving skipped/failure statuses instead of hiding mixed-batch results.
- The local memory console backend now delegates purge requests to `MemoryService.purgeRejectedMemories()` so the real console route reaches the existing service API.
- Verification passed: clean LSP diagnostics, focused rejected quarantine and purge confirmation tests, combined memory-console render/server tests, typecheck, and Task 6 evidence files under `.sisyphus/evidence/`.
- Follow-up guard: duplicate purge ids now fail as a 400 validation error before the backend is called, matching the service uniqueness contract.

## 2026-05-09 14:35 +07 — read-only graph route page

- Replaced the `/graph` placeholder with a real server-rendered graph page backed by `buildMemoryGraph()`; the projection remains derived at request time and is not persisted.
- Added a GET-only `edgeType` display filter (`all`, `has_source`, `tagged_with`, `has_evidence`, `reviewed_as`, `related_memory`) while keeping graph construction unchanged and read-only.
- Graph route related-memory inputs use read-only review overview/assist data when available, then pass hints/suggestions into the Task 4 projection; write-capable methods are not called by GET `/graph`.
- Rendered graph output now includes total node/edge/warning counts, counts grouped by node/edge type, warning copy for missing related ids, node groups for memory/source/tag/evidence, edge groups for all graph edge types, and selected node details via `id` query links.
- Verification passed: clean LSP diagnostics on modified files, focused GET `/graph` test, focused graph warning render test, combined memory-console graph/render/server tests, full typecheck, and Task 7 evidence files under `.sisyphus/evidence/`.

## 2026-05-09 14:58 +07 — fixture-backed console integration tests

- Added `tests/memory-console-integration.test.ts` as the true route-level console integration layer: temp JSONL/LanceDB stores seed real `MemoryService` records, while `createMemoryConsoleBackend()` wraps service methods with spies for route assertions.
- GET route coverage now proves browse is mutation-control-free, review/rejected/graph render from fixture state, graph leaves canonical log/index write methods untouched, and 404/405 paths do not read or mutate.
- POST coverage now proves review/promote call exactly their intended service method, and purge dry-run/final/missing-confirmation/mixed batches preserve non-rejected and wrong-scope records through fixture-backed service assertions.
- Verification passed: clean LSP diagnostics, `rtk bun run test -- memory-console-integration`, `rtk bun run test -- memory-console-integration -t "purge"`, `rtk bun run typecheck`, and `rtk bun run build`; required evidence files were written under `.sisyphus/evidence/`.

## 2026-05-09 14:52 +07 — console docs and package references cleanup

- Documented `bun run memory-console` in the human-facing README commands and added a dedicated local memory console section.
- Kept the console language local-only, with browse read-only, derived graph projection, and rejected-only guarded purge phrasing aligned across README, MCP usage, architecture, and boundary docs.
- Preserved the package script reference in `package.json` and verified stale `memory-viewer` wording is absent from the docs/package/source surface.


## 2026-05-09 15:35 +07 — Task 10 full verification evidence

- Task 10 evidence files were regenerated after fixing the current memory-console regression where global navigation cleared project/container filters but kept a stale selected memory id.
- Verification passed with recorded evidence: `rtk bun run test -- memory-console memory-service` (98 passed), `rtk bun run typecheck` (exit 0), `rtk bun run test` (251 passed), `rtk bun run build` (exit 0), and `git diff --check` (exit 0).
- LSP diagnostics were clean for `src` and `tests` directories after the fix.
- Identity grep evidence distinguishes historical `.agent-state` memory/retrospective mentions from current product surface; README/docs/package/src/tests returned `NO_MATCHES_IN_PRODUCT_SURFACE` for `memory-viewer` / `Memory viewer` / `memory viewer`.
- Scope inspection showed the broad intended Task 1-9 migration surface plus Task 10 evidence/notepad files; no unexpected implementation area outside the memory-console/control-graph plan was identified.
