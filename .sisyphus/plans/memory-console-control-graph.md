# Memory Console Control and Graph

## TL;DR
> **Summary**: Replace the current read-only `memory-viewer` product surface with `memory-console`, a local memory-management console with browse safety, review actions, rejected quarantine plus guarded permanent purge, and a read-only derived knowledge graph.
> **Deliverables**:
> - `memory-console` source/module/CLI/package identity replacing `memory-viewer`
> - Console browse, review queue, rejected management, purge, and graph routes
> - Existing-memory API integration for review/promote/assist/upsert-style operations
> - Narrow rejected-only purge API with canonical log + index consistency
> - Read-only graph projection derived from memory metadata only
> - Updated docs and tests for the new product identity
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Tasks 4/5/6/7 → Task 8 → Final Verification

## Context
### Original Request
- User wants to change from `memory-viewer` into a more control-oriented surface that can manage memories directly.
- User wants rejected memory cleanup to be easy and asked whether permanent deletion exists.
- User wants to view a knowledge graph.
- User confirmed product direction: `memory-viewer` should not remain; the product should become `memory-console`.

### Interview Summary
- Product identity: `memory-console` replaces `memory-viewer`.
- Do not keep `memory-viewer` as a separate product surface or long-lived CLI alias.
- Preserve old viewer safety only as console browse-mode behavior and regression tests.
- Rejected cleanup must include a permanent delete option, but only as a guarded rejected-only purge path.
- Knowledge graph first version is read-only and derived; no graph store, no editable graph relationships.

### Metis Review (gaps addressed)
- Metis classified the work as architecture + mid-sized task.
- Guardrails incorporated: no workflow/executor/task/worker controls; no parallel viewer product; rejected-only purge validation; graph projection-only.
- Acceptance criteria must use exact commands: `rtk bun run typecheck`, `rtk bun run test`, `rtk bun run build`.
- Plan must include explicit route/API/test names and avoid manual visual confirmation.

### Oracle Review (architecture constraints)
- Preserve old read-only behavior as safety tests, but evolve/split into console identity.
- Use existing mutation APIs first.
- If purge is added, scope it hard: rejected only, explicit confirmation, per-record results, no source document/verified/canonical overreach.
- Graph must be read-only projection from existing fields; no new graph source of truth.

## Work Objectives
### Core Objective
Replace the read-only memory viewer with a local memory console that remains inside this package's memory-only boundary while adding safe memory lifecycle controls and graph inspection.

### Deliverables
- Rename source identity from `memory-viewer` to `memory-console`.
- `src/memory-console.ts` CLI entry and `memory-console` package script.
- `src/features/memory-console/*` module replacing `src/features/memory-viewer/*`.
- Console browse mode with existing filter/search/project behavior.
- Review queue / review assist / selected memory management UI.
- Rejected quarantine page and guarded permanent purge route/API.
- Read-only knowledge graph projection and graph page.
- Updated tests: server, render, filters, memory service, graph projection, package/plugin/docs references.
- Updated docs: README, MCP usage docs if command references change, architecture docs if needed.

### Definition of Done (verifiable conditions with commands)
- `rtk bun run typecheck` exits `0`.
- `rtk bun run test` exits `0`.
- `rtk bun run build` exits `0`.
- `package.json` exposes `memory-console` and no longer exposes `memory-viewer` as a script.
- No tracked source/doc/package references preserve `memory-viewer` as the product identity except migration/history notes or tests explicitly asserting removal.
- Console browse mode still hides mutation controls and never writes on `GET`/`HEAD`.
- Mutating routes use `POST` and return exact status codes with deterministic response bodies.
- Rejected purge physically removes only rejected records matching the requested scope and updates retrieval index rows for purged ids.
- Graph route renders from derived data and performs no canonical log, index, or graph-store writes.

### Must Have
- Memory-only scope: memory records, review state, source/provenance/evidence/tags, documents, retrieval/index consistency.
- Local-only server binding remains `127.0.0.1`.
- Browse mode has no mutation controls.
- Management actions are grouped and explicit.
- Destructive actions are isolated and require typed confirmation.
- Scope validation for project/global records.
- Per-record purge result reporting.
- Missing graph references are warnings, not failures.

### Must NOT Have
- No workflow control, worker routing, task lifecycle, executor state, agent orchestration, or hook runtime control.
- No mutation through `GET` or `HEAD`.
- No `reset_memory_storage` use for rejected cleanup.
- No purge of `verified`, `pending`, `deferred`, non-rejected, wrong-scope, or missing records.
- No source-document deletion during memory purge.
- No graph persistence or editable graph relationship UI in this iteration.
- No long-lived `memory-viewer` CLI alias or separate docs identity.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + Vitest; add tests with implementation and run full repo verification.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 identity migration, Task 2 console contracts/routes, Task 3 purge service API, Task 4 graph projection model
Wave 2: Task 5 console browse/review UI, Task 6 rejected quarantine/purge UI, Task 7 graph UI
Wave 3: Task 8 docs/package/public reference cleanup, Task 9 full integration tests
Wave 4: Task 10 final repo verification and evidence collation

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 2, 5, 8, 9.
- Task 2 blocks Tasks 5, 6, 7, 9.
- Task 3 blocks Task 6 and Task 9 purge tests.
- Task 4 blocks Task 7 and Task 9 graph tests.
- Tasks 5, 6, 7 block Task 9.
- Tasks 8 and 9 block Task 10.
- Task 10 blocks final verification wave.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 4 tasks → quick, deep, unspecified-high
- Wave 2 → 3 tasks → visual-engineering, deep, unspecified-high
- Wave 3 → 2 tasks → writing, unspecified-high
- Wave 4 → 1 task → unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Rename product identity from memory-viewer to memory-console

  **What to do**: Rename/migrate the current viewer module and CLI identity. Move `src/features/memory-viewer/*` to `src/features/memory-console/*`. Replace `src/memory-viewer.ts` with `src/memory-console.ts`. Rename exported constants/functions/types from `MemoryViewer`/`Viewer` where externally visible to `MemoryConsole`/`Console`, while preserving internal concepts like `ConsoleFilterState` and `ConsoleLoadResult`. Update package script/files from `memory-viewer`/`src/memory-viewer.ts`/`src/features/memory-viewer` to `memory-console`/`src/memory-console.ts`/`src/features/memory-console`. Rename tests from `memory-viewer-*.test.ts` to `memory-console-*.test.ts`.
  **Must NOT do**: Do not leave a long-lived `memory-viewer` CLI script. Do not add mutation behavior in this task. Do not remove browse/read-only safety assertions.

  **Recommended Agent Profile**:
  - Category: `quick` - Mechanical rename across known files with test updates.
  - Skills: [] - No special skill needed.
  - Omitted: [`frontend-ui-ux`] - This task is identity/refactor, not UI design.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 5, 8, 9 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `package.json:24-27` - current package files include memory-viewer source and CLI.
  - Pattern: `package.json:37-47` - current script is `memory-viewer`; replace with `memory-console`.
  - Pattern: `src/memory-viewer.ts:1-9` - current CLI imports read-only reader and logs “Memory viewer”; migrate to console wording.
  - Pattern: `tests/memory-viewer-server.test.ts:192-206` - current read-only API guard must become console browse-mode guard, not deleted.
  - Pattern: `tests/memory-viewer-render.test.ts:155-161` - current no-mutation-control test must remain for browse mode.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rtk bun run typecheck` exits `0` after imports are renamed.
  - [ ] `rtk bun run test -- memory-console` exits `0` and discovers renamed console tests.
  - [ ] `node -e "const pkg=require('./package.json'); if (!pkg.scripts['memory-console'] || pkg.scripts['memory-viewer']) process.exit(1)"` exits `0`.
  - [ ] `git grep -n "memory-viewer\|Memory viewer\|memory viewer" -- ':! .sisyphus/**'` returns no product-surface references except deliberate migration-history strings in tests/docs, if any.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Console CLI identity replaces viewer identity
    Tool: Bash
    Steps: git grep -n "Memory console listening" src/memory-console.ts && ! git grep -n "Memory viewer listening\|Memory viewer" src package.json
    Expected: console startup copy exists and old viewer startup/product copy is absent from source/package identity
    Evidence: .sisyphus/evidence/task-1-console-cli.txt

  Scenario: Old viewer script is absent
    Tool: Bash
    Steps: node -e "const pkg=require('./package.json'); console.log(Boolean(pkg.scripts['memory-viewer']))"
    Expected: output is "false"
    Evidence: .sisyphus/evidence/task-1-no-viewer-script.txt
  ```

  **Commit**: YES | Message: `refactor(console): rename memory viewer surface` | Files: [`package.json`, `src/features/memory-console/**`, `src/memory-console.ts`, `tests/memory-console-*.test.ts`]

- [x] 2. Introduce memory-console route and action contracts

  **What to do**: Replace the single-root viewer server contract with explicit console routes and action parsing. Keep `GET /` as browse mode. Add `GET /review`, `GET /rejected`, and `GET /graph`. Add POST-only action endpoints: `POST /actions/review`, `POST /actions/promote`, `POST /actions/purge-rejected`. Define typed request/response contracts in console types: `ConsoleRoute`, `ConsoleActionResult`, `ConsoleActionError`, `ConsoleReviewActionInput`, `ConsolePromoteActionInput`, `ConsolePurgeRejectedActionInput`. Route invalid methods to `405` with method-specific text. Route unknown paths to `404`. Return HTML redirects or rendered result pages consistently; choose status `303` after successful POST to a list/detail page, and status `400` for validation failures.
  **Must NOT do**: Do not write memory changes in `GET`/`HEAD`. Do not use `resetStorage` for any action. Do not expose purge under a GET link.

  **Recommended Agent Profile**:
  - Category: `deep` - Requires route design and server contract changes.
  - Skills: [] - Backend TypeScript tests are enough.
  - Omitted: [`playwright`] - Route behavior can be tested via HTTP/unit tests first.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5, 6, 7, 9 | Blocked By: 1

  **References**:
  - Pattern: `src/features/memory-viewer/server.ts:44-64` - current server wraps request handling and sets content/cache headers.
  - Pattern: `src/features/memory-viewer/server.ts:91-120` - current request handler only allows GET/HEAD and root path.
  - Pattern: `src/features/memory-viewer/types.ts:69-84` - current load result and reader interface must become console contracts.
  - Test: `tests/memory-viewer-server.test.ts:9-42` - current load tests show reader injection style for route-independent unit tests.

  **Acceptance Criteria**:
  - [ ] `tests/memory-console-server.test.ts` covers `GET /`, `GET /review`, `GET /rejected`, `GET /graph`, unknown `GET /missing`, unsupported `PUT /`, and POST validation failure.
  - [ ] `HEAD /` returns no body and never calls mutation methods.
  - [ ] `GET /actions/review` returns `405` or `404` and never mutates.
  - [ ] `rtk bun run test -- memory-console-server` exits `0`.

  **QA Scenarios**:
  ```
  Scenario: Browse route remains safe
    Tool: Bash
    Steps: rtk bun run test -- memory-console-server -t "GET /"
    Expected: route returns status 200, content-type text/html, and no mutation spy is called
    Evidence: .sisyphus/evidence/task-2-browse-route.txt

  Scenario: Mutation through GET is blocked
    Tool: Bash
    Steps: rtk bun run test -- memory-console-server -t "GET /actions/review"
    Expected: status is 405 or 404; mutation spy call count is 0
    Evidence: .sisyphus/evidence/task-2-get-action-blocked.txt
  ```

  **Commit**: YES | Message: `feat(console): add route and action contracts` | Files: [`src/features/memory-console/server.ts`, `src/features/memory-console/types.ts`, `tests/memory-console-server.test.ts`]

- [x] 3. Add rejected-only permanent purge service API

  **What to do**: Add a narrow purge API in memory core, not a UI-only file rewrite. Define `PurgeRejectedMemoriesInput` and `PurgeRejectedMemoriesResult` in memory types. Input shape: `{ ids: readonly string[]; scope: "global" | "project"; projectId?: string; containerId?: string; confirmation: "DELETE REJECTED"; dryRun?: boolean }`. Validation: ids non-empty and unique; if `scope === "project"`, require both `projectId` and `containerId`; if `scope === "global"`, reject provided project/container ids. Add schema in `schemas.ts`. Add `JsonlLogStore.deleteRecordsByIds(ids)` or equivalent atomic rewrite helper that returns deleted records and missing ids. Add `MemoryService.purgeRejectedMemories(payload)` that re-reads each record immediately before deletion, deletes only records with `reviewStatus === "rejected"` and matching scope, deletes retrieval rows via `MemoryRecordsTable.deleteRowsByIds`, and returns per-record outcomes: `deleted`, `skipped_not_found`, `skipped_not_rejected`, `skipped_scope_mismatch`, `dry_run`. Do not add a public MCP tool in this plan; expose purge only through the internal service and memory-console action route.
  **Must NOT do**: Do not delete source documents. Do not delete non-rejected records. Do not call `resetStorage`. Do not silently ignore mixed batches; return per-id outcomes.

  **Recommended Agent Profile**:
  - Category: `deep` - Data integrity change across canonical log and index.
  - Skills: [] - Requires repo-local TypeScript/test work.
  - Omitted: [`frontend-ui-ux`] - No UI in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 9 | Blocked By: none

  **References**:
  - API/Type: `src/features/memory/types.ts:6-8` - review statuses/actions include rejected but no purge type yet.
  - API/Type: `src/features/memory/types.ts:120-139` - review result shape to mirror status-result style.
  - Pattern: `src/features/memory/memory-service.ts:172-230` - review action updates canonical log then deletes/upserts index row.
  - Pattern: `src/features/memory/memory-service.ts:96-125` - resetStorage is destructive and must not be reused for rejected cleanup.
  - Pattern: `src/features/memory/log/jsonl-log-store.ts:69-82` - atomic rewrite pattern for replacing records; extend for deletion.
  - Pattern: `src/features/memory/log/jsonl-log-store.ts:27-41` - rejected records are excluded from review queue already.
  - Test: `tests/memory-service.test.ts:254+` - service fixture pattern for memory service mutation tests.

  **Acceptance Criteria**:
  - [ ] New service tests prove rejected project record is deleted from canonical log and index.
  - [ ] New service tests prove verified/pending/deferred records are not deleted and return skipped outcomes.
  - [ ] New service tests prove wrong `projectId/containerId` records are not deleted.
  - [ ] New service tests prove mixed batches return per-id outcomes and do not fail the whole batch.
  - [ ] New service tests prove `confirmation !== "DELETE REJECTED"` fails validation before deletion.
  - [ ] `rtk bun run test -- memory-service -t "purge rejected"` exits `0`.

  **QA Scenarios**:
  ```
  Scenario: Purge deletes only rejected records
    Tool: Bash
    Steps: rtk bun run test -- memory-service -t "purge rejected"
    Expected: rejected id absent from canonical log and search; non-rejected ids remain
    Evidence: .sisyphus/evidence/task-3-purge-rejected.txt

  Scenario: Purge confirmation protects data
    Tool: Bash
    Steps: rtk bun run test -- memory-service -t "DELETE REJECTED"
    Expected: invalid confirmation throws validation error and canonical log is unchanged
    Evidence: .sisyphus/evidence/task-3-purge-confirmation.txt
  ```

  **Commit**: YES | Message: `feat(memory): add rejected-only purge service` | Files: [`src/features/memory/types.ts`, `src/features/memory/schemas.ts`, `src/features/memory/memory-service.ts`, `src/features/memory/log/jsonl-log-store.ts`, `tests/memory-service.test.ts`]

- [x] 4. Add read-only memory graph projection model

  **What to do**: Add `src/features/memory-console/graph.ts` with pure functions only. Define `MemoryGraph`, `MemoryGraphNode`, `MemoryGraphEdge`, `MemoryGraphWarning`. Derive graph from `MemoryRecord[]` / normalized console memories. Node types: `memory`, `source`, `tag`, `evidence`. Edge types: `has_source`, `tagged_with`, `has_evidence`, `reviewed_as`, `related_memory`. For first iteration, derive `related_memory` from available review hints (`relatedMemoryIds`) when supplied by review queue overview/assist data; if only raw records are available, omit related edges and emit no warning. Source node key: `source:${type}:${uri ?? ""}:${title ?? ""}`. Tag node key: `tag:${tag}`. Evidence node key: `evidence:${type}:${value}`. Missing referenced memory ids become warnings and do not fail rendering. Add graph tests for empty records, tags/source/evidence, related ids, and missing references. No file/storage writes in graph code.
  **Must NOT do**: Do not persist graph data. Do not add editable relationship APIs. Do not infer semantic truth beyond metadata edges.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Pure data model with edge cases.
  - Skills: [] - No external graph library required.
  - Omitted: [`librarian`] - Local metadata is sufficient.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 7, 9 | Blocked By: none

  **References**:
  - API/Type: `src/features/memory/types.ts:29-47` - MemoryRecord fields for nodes and edges.
  - API/Type: `src/features/memory/types.ts:167-190` - review hints contain `relatedMemoryIds` for relation edges.
  - API/Type: `src/features/memory/types.ts:198-212` - review assist suggestions also carry related memory ids.
  - Research: wiki materializer uses `sourceRecordIds` and source grouping; graph projection must remain derived like wiki output, not canonical.

  **Acceptance Criteria**:
  - [ ] `tests/memory-console-graph.test.ts` proves graph builder returns deterministic node/edge ordering.
  - [ ] Empty input returns empty nodes/edges and no throw.
  - [ ] Source/tag/evidence fields create expected nodes and edges.
  - [ ] Missing related ids produce warnings, not exceptions.
  - [ ] Graph builder tests assert no fs/log/index dependencies are imported.

  **QA Scenarios**:
  ```
  Scenario: Graph derives metadata edges
    Tool: Bash
    Steps: rtk bun run test -- memory-console-graph -t "source tag evidence"
    Expected: graph contains memory/source/tag/evidence nodes with deterministic edges
    Evidence: .sisyphus/evidence/task-4-graph-metadata.txt

  Scenario: Graph tolerates missing related memory ids
    Tool: Bash
    Steps: rtk bun run test -- memory-console-graph -t "missing related"
    Expected: result includes warning and exits 0 without writes
    Evidence: .sisyphus/evidence/task-4-graph-missing-reference.txt
  ```

  **Commit**: YES | Message: `feat(console): derive memory graph projection` | Files: [`src/features/memory-console/graph.ts`, `src/features/memory-console/types.ts`, `tests/memory-console-graph.test.ts`]

- [x] 5. Build console browse and review management UI

  **What to do**: Update `render.ts` into a console renderer with browse mode, navigation, detail pane, review queue page, and management forms. Navigation: `Browse`, `Review Queue`, `Rejected`, `Graph`. Browse route (`GET /`) keeps old safe viewer behavior: search input, advanced filters, project summaries, memory details, no mutation forms in browse-only detail unless the route is in management context. Review route (`GET /review`) lists review queue overview items with priority, reasons, hints, and links to assist/details. For selected review item, render forms for `review_memory` actions: reject, defer, edit_then_promote. Render `get_review_assist` suggestions as advisory text only. All forms use `method="post"` and target `/actions/review` or `/actions/promote`; include hidden `id`, action fields, evidence fields where required, and return target route.
  **Must NOT do**: Do not put purge controls on Browse or Review Queue except link to Rejected page. Do not auto-apply review assist suggestions. Do not mutate during render.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Server-rendered UI and UX safety.
  - Skills: [] - Repo has custom HTML renderer, no external UI framework.
  - Omitted: [`uncodixify`] - This is utilitarian local console, not marketing UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 1, 2

  **References**:
  - Pattern: `tests/memory-viewer-render.test.ts:15-61` - escaping expectations for content/source/evidence/review decisions must be preserved.
  - Pattern: `tests/memory-viewer-render.test.ts:63-68` - empty state copy pattern.
  - Pattern: `tests/memory-viewer-render.test.ts:70-89` - navigation link behavior.
  - Pattern: `tests/memory-viewer-render.test.ts:142-153` - Search + Advanced filter controls.
  - Pattern: `tests/memory-viewer-render.test.ts:155-161` - browse mode must still not render mutation controls.
  - API/Type: `src/features/memory/types.ts:173-190` - review overview item fields to display.
  - API/Type: `src/features/memory/types.ts:207-212` - review assist result fields to display as advisory.

  **Acceptance Criteria**:
  - [ ] Browse render test asserts no `method="post"` and no destructive controls on `GET /`.
  - [ ] Review render test asserts forms exist for reject/defer/edit_then_promote with escaped values.
  - [ ] Review assist render test labels suggestions as advisory and never auto-selects an action.
  - [ ] POST action tests prove review/promote calls existing service methods with parsed inputs.
  - [ ] `rtk bun run test -- memory-console-render memory-console-server` exits `0`.

  **QA Scenarios**:
  ```
  Scenario: Browse mode remains non-mutating
    Tool: Bash
    Steps: rtk bun run test -- memory-console-render -t "browse mode"
    Expected: HTML has Browse navigation and no POST forms/destructive buttons
    Evidence: .sisyphus/evidence/task-5-browse-safe.txt

  Scenario: Review action form posts explicit action
    Tool: Bash
    Steps: rtk bun run test -- memory-console-server -t "POST /actions/review"
    Expected: review service spy receives id/action/note/evidence payload and response is 303 on success
    Evidence: .sisyphus/evidence/task-5-review-post.txt
  ```

  **Commit**: YES | Message: `feat(console): add review management UI` | Files: [`src/features/memory-console/render.ts`, `src/features/memory-console/server.ts`, `src/features/memory-console/types.ts`, `tests/memory-console-render.test.ts`, `tests/memory-console-server.test.ts`]

- [x] 6. Build rejected quarantine and guarded purge UI

  **What to do**: Add rejected management to console. `GET /rejected` shows only records with `reviewStatus === "rejected"`, grouped/filterable by scope/project/container, with clear “Quarantine” language. Add a two-step purge UX in server-rendered HTML: first selected rejected ids, then typed confirmation field. POST `/actions/purge-rejected` accepts ids, scope, project/container ids, confirmation, and `dryRun`. First POST with `dryRun=true` renders preview/per-id eligibility results without deletion. Final POST with `dryRun=false` and exact confirmation calls `MemoryService.purgeRejectedMemories` from Task 3 and renders a result page/list with per-id statuses.
  **Must NOT do**: Do not expose purge from Browse. Do not allow purge without typed confirmation. Do not allow empty ids. Do not hide per-record failures.

  **Recommended Agent Profile**:
  - Category: `deep` - Destructive UX and backend integration require careful safety.
  - Skills: [] - No external browser automation required initially.
  - Omitted: [`artistry`] - Safety and clarity matter more than creative design.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 2, 3

  **References**:
  - Pattern: `src/features/memory/log/jsonl-log-store.ts:27-41` - review queue already excludes rejected; rejected page must explicitly select rejected records instead.
  - API/Type: `src/features/memory/types.ts:6-8` - rejected status definition.
  - Pattern: `tests/memory-viewer-server.test.ts:163-190` - current active view hides rejected noise; preserve this while adding rejected page.
  - Task 3 API: `MemoryService.purgeRejectedMemories` - must be used for permanent deletion.

  **Acceptance Criteria**:
  - [ ] Rejected page test proves only rejected records render.
  - [ ] Rejected page test proves verified/pending/deferred records are absent.
  - [ ] Purge POST with missing/incorrect confirmation returns `400` and no deletion.
  - [ ] Purge POST with mixed ids returns per-id success/failure results.
  - [ ] Purge result page escapes ids/content/status values.

  **QA Scenarios**:
  ```
  Scenario: Rejected quarantine lists only rejected records
    Tool: Bash
    Steps: rtk bun run test -- memory-console-render -t "rejected quarantine"
    Expected: rejected id appears; verified/pending/deferred ids do not appear
    Evidence: .sisyphus/evidence/task-6-rejected-list.txt

  Scenario: Permanent purge requires confirmation
    Tool: Bash
    Steps: rtk bun run test -- memory-console-server -t "purge confirmation"
    Expected: missing confirmation returns 400 and purge service spy is not called
    Evidence: .sisyphus/evidence/task-6-purge-confirmation.txt
  ```

  **Commit**: YES | Message: `feat(console): add rejected quarantine and purge` | Files: [`src/features/memory-console/render.ts`, `src/features/memory-console/server.ts`, `tests/memory-console-render.test.ts`, `tests/memory-console-server.test.ts`]

- [x] 7. Build read-only knowledge graph page

  **What to do**: Add `GET /graph` route and renderer section using Task 4 graph projection. Render graph as accessible HTML/SVG or structured HTML lists/cards without adding a client-side graph library. Required sections: summary counts, warnings, node list grouped by type, edge list grouped by type, and selected memory/source/tag details when query params select a node id. Provide filters for scope/project/container and minimum edge type. Keep graph read-only: no forms except GET filters, no mutation buttons. Include empty-state copy for no memories.
  **Must NOT do**: Do not add editable relationships. Do not write graph files. Do not call purge/review/promote from graph route.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Needs clear local graph UI without overdesign.
  - Skills: [] - Use server-rendered HTML; no Playwright required unless later visual QA is requested.
  - Omitted: [`librarian`] - No external graph framework is needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 2, 4

  **References**:
  - Task 4 graph projection: node/edge/warning model.
  - API/Type: `src/features/memory/types.ts:29-47` - memory fields for graph detail rendering.
  - API/Type: `src/features/memory/types.ts:167-190` - `relatedMemoryIds` graph edge source.
  - Guardrail: `AGENT_NEXT_STEPS.md:22-29` - raw/derived memory direction is deferred; graph must stay derived and reviewed-scope aware.

  **Acceptance Criteria**:
  - [ ] Graph route test returns `200` and includes graph summary counts.
  - [ ] Graph render test includes source/tag/evidence edge groups for fixture data.
  - [ ] Graph render test includes warning copy for missing referenced memory id.
  - [ ] Graph route GET performs no write-capable service calls.
  - [ ] `rtk bun run test -- memory-console-graph memory-console-render memory-console-server` exits `0`.

  **QA Scenarios**:
  ```
  Scenario: Graph page renders derived metadata
    Tool: Bash
    Steps: rtk bun run test -- memory-console-server -t "GET /graph"
    Expected: status 200, graph summary visible, no mutation service spy calls
    Evidence: .sisyphus/evidence/task-7-graph-route.txt

  Scenario: Graph page reports broken references safely
    Tool: Bash
    Steps: rtk bun run test -- memory-console-render -t "graph warnings"
    Expected: warning contains missing memory id and render still succeeds
    Evidence: .sisyphus/evidence/task-7-graph-warning.txt
  ```

  **Commit**: YES | Message: `feat(console): add read-only graph view` | Files: [`src/features/memory-console/graph.ts`, `src/features/memory-console/render.ts`, `src/features/memory-console/server.ts`, `tests/memory-console-graph.test.ts`, `tests/memory-console-render.test.ts`, `tests/memory-console-server.test.ts`]

- [x] 8. Update documentation and package references for memory-console

  **What to do**: Update human and AI-facing docs to describe `memory-console` as the local memory management UI. README command list should include `bun run memory-console`. Remove `memory-viewer` identity from docs unless in migration notes. Update `MCP_USAGE.md` only if it references the viewer/console or cleanup semantics. Update `ARCHITECTURE.md` / `ARCHITECTURE_BOUNDARIES.md` only to clarify the console remains memory-only and graph is derived/read-only; do not broaden package boundary. Update `AGENT_NEXT_STEPS.md` if immediate work queue should mention console guardrails.
  **Must NOT do**: Do not promise hosted auth, workflow control, executor control, or graph persistence. Do not document purge as default cleanup.

  **Recommended Agent Profile**:
  - Category: `writing` - Documentation precision and boundary language.
  - Skills: [] - Repo docs already provide style.
  - Omitted: [`deep-research`] - External docs not needed.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 5, 6, 7

  **References**:
  - Boundary: `ARCHITECTURE_BOUNDARIES.md:11-22` - memory package owns memory flows but not workflow/task/worker control.
  - Boundary: `ARCHITECTURE_BOUNDARIES.md:66-73` - drift checks for memory contract clarity.
  - Direction: `AGENT_NEXT_STEPS.md:5-20` - north star and memory-only direction.
  - Direction: `AGENT_NEXT_STEPS.md:22-29` - raw/derived future direction and required gates.
  - Package: `package.json:37-47` - scripts reference.

  **Acceptance Criteria**:
  - [ ] `git grep -n "memory-viewer\|Memory viewer\|memory viewer" README.md MCP_USAGE.md ARCHITECTURE.md ARCHITECTURE_BOUNDARIES.md AGENT_NEXT_STEPS.md package.json src tests` has no stale product references.
  - [ ] Docs explicitly say console is local memory management only.
  - [ ] Docs explicitly say graph is derived/read-only and not a source of truth.
  - [ ] Docs explicitly say purge is rejected-only and guarded, not default cleanup.

  **QA Scenarios**:
  ```
  Scenario: Docs expose memory-console command
    Tool: Bash
    Steps: git grep -n "memory-console" README.md package.json
    Expected: README and package.json both reference memory-console
    Evidence: .sisyphus/evidence/task-8-docs-console.txt

  Scenario: Docs do not broaden memory boundary
    Tool: Bash
    Steps: git grep -n "workflow control\|worker routing\|executor" ARCHITECTURE_BOUNDARIES.md AGENT_NEXT_STEPS.md README.md
    Expected: any matches are guardrails saying those are out of scope, not promised features
    Evidence: .sisyphus/evidence/task-8-boundary-guardrails.txt
  ```

  **Commit**: YES | Message: `docs(console): document memory console boundary` | Files: [`README.md`, `MCP_USAGE.md`, `ARCHITECTURE.md`, `ARCHITECTURE_BOUNDARIES.md`, `AGENT_NEXT_STEPS.md`, `package.json`]

- [x] 9. Add end-to-end console integration tests

  **What to do**: Add integration-level tests that instantiate the console with a fixture service/reader and exercise route flows end-to-end without a real browser. Cover: browse route safe rendering, review queue route, review POST, promote POST, rejected route, purge POST success/failure/mixed batch, graph route, unknown route, unsupported methods. Use real fixture memory records where possible and spies where needed to assert no writes on GET. Ensure tests create temporary data directories and do not touch real user memory data.
  **Must NOT do**: Do not require manual browser confirmation. Do not use real local memory storage. Do not skip destructive edge cases.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Cross-cutting verification.
  - Skills: [] - Vitest and Node HTTP tests.
  - Omitted: [`playwright`] - Server-level integration is sufficient for this local console plan.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 2, 3, 4, 5, 6, 7

  **References**:
  - Test: `tests/memory-service.test.ts:22-44` - temp fixture setup pattern.
  - Test: `tests/memory-viewer-server.test.ts:209-219` - reader spy fixture pattern.
  - Test: `tests/memory-viewer-render.test.ts:164-175` - render fixture result pattern.
  - API: new console server route/action contracts from Task 2.

  **Acceptance Criteria**:
  - [ ] Integration tests cover every route and action listed in Task 2.
  - [ ] Tests assert GET routes never call write-capable service methods.
  - [ ] Tests assert POST routes call exactly one intended service method.
  - [ ] Tests assert purge never deletes wrong-scope/non-rejected records.
  - [ ] Tests assert graph route does not write to canonical log/index.

  **QA Scenarios**:
  ```
  Scenario: Console route integration passes
    Tool: Bash
    Steps: rtk bun run test -- memory-console-integration
    Expected: all route/action integration tests pass with exit code 0
    Evidence: .sisyphus/evidence/task-9-console-integration.txt

  Scenario: Destructive edge cases are covered
    Tool: Bash
    Steps: rtk bun run test -- memory-console-integration -t "purge"
    Expected: success, wrong-scope, non-rejected, missing id, and mixed-batch cases pass
    Evidence: .sisyphus/evidence/task-9-purge-integration.txt
  ```

  **Commit**: YES | Message: `test(console): cover console management flows` | Files: [`tests/memory-console-integration.test.ts`, related fixtures]

- [x] 10. Run full verification and collect evidence

  **What to do**: Run repo verification in required order and save outputs. First run focused tests for changed areas, then full typecheck/test/build. Inspect git diff to ensure only intended files changed and no source still treats `memory-viewer` as product identity. Record evidence files under `.sisyphus/evidence/`.
  **Must NOT do**: Do not run formatters/codegen that rewrite unrelated files. Do not commit generated wiki output unless tests intentionally require fixtures. Do not declare done if any command fails.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Verification and evidence collation.
  - Skills: [] - Shell commands and test interpretation.
  - Omitted: [`visual-engineering`] - No UI implementation in this task.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Final Verification | Blocked By: 8, 9

  **References**:
  - Repo rule: `AGENTS.md` default verification order is `bun run typecheck`, `bun run test`, `bun run build`.
  - Environment rule: prepend `rtk` while preserving repo command shape.
  - Package: `package.json:43-45` - `build`, `typecheck`, `test` scripts.

  **Acceptance Criteria**:
  - [ ] `rtk bun run typecheck` exits `0`.
  - [ ] `rtk bun run test` exits `0`.
  - [ ] `rtk bun run build` exits `0`.
  - [ ] `git diff --check` exits `0`.
  - [ ] `git grep -n "memory-viewer\|Memory viewer\|memory viewer" -- ':! .sisyphus/**'` has no stale product references.
  - [ ] Evidence files exist for focused tests, typecheck, test, build, diff-check, and grep check.

  **QA Scenarios**:
  ```
  Scenario: Full verification passes
    Tool: Bash
    Steps: rtk bun run typecheck && rtk bun run test && rtk bun run build
    Expected: all commands exit 0
    Evidence: .sisyphus/evidence/task-10-full-verification.txt

  Scenario: Identity cleanup is complete
    Tool: Bash
    Steps: git grep -n "memory-viewer\|Memory viewer\|memory viewer" -- ':! .sisyphus/**'
    Expected: no stale product-surface references remain; any intentional migration mentions are documented in evidence
    Evidence: .sisyphus/evidence/task-10-identity-grep.txt
  ```

  **Commit**: YES | Message: `chore(console): verify memory console migration` | Files: [`.sisyphus/evidence/**`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ browser/manual HTTP checks if UI route is running)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit per task when each task is verified and its focused tests pass.
- Do not squash across destructive purge API and UI tasks; keep data-integrity changes separately reviewable.
- Do not commit `.agent-state/wiki/` generated outputs unless a test fixture explicitly requires them.
- No force push. No skipped hooks.

## Success Criteria
- `memory-console` is the sole product identity for the local UI.
- Browse mode preserves previous safe read-only inspection behavior.
- Review management uses existing memory APIs and does not invent duplicate review semantics.
- Rejected cleanup includes quarantine inspection and a guarded permanent purge path.
- Permanent purge is impossible for non-rejected or wrong-scope records.
- Knowledge graph is useful, read-only, derived, and non-canonical.
- Docs preserve the package's memory-only boundary.
- Full verification passes with evidence.
